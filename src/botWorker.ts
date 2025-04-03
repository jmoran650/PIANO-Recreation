// src/botWorker.ts
import dotenv from "dotenv";
import { parentPort, workerData } from "worker_threads";
import { AgentBot, BotOptions, createAgentBot } from "./createAgentBot"; // Adjust path if needed
import { StepNode, buildGoalTree } from "./goalPlanner"; // Adjust path
import { serializeSharedState } from "./server/serverUtils"; // Adjust path
import { handleChatTestCommand } from "./chatTests";

dotenv.config(); // Load environment variables early

// --- Constants ---
const ALL_PREFIX = "all:";
const TEST_COMMAND_PREFIX = "test ";
const BLOCKS_COMMAND = "blocks";
const MOBS_COMMAND = "mobs";
const TOME_COMMAND = "tome"; // Example: Assuming 'tome' is a specific command

// Message types for communication with the main thread
enum MessageType {
  GetState = "getState",
  StateUpdate = "stateUpdate",
  LlmRequest = "llmRequest",
  LlmResponse = "llmResponse",
  StartGoalPlan = "startGoalPlan",
  GoalPlanProgress = "goalPlanProgress",
  GoalPlanComplete = "goalPlanComplete",
  GoalPlanError = "goalPlanError",
  Initialized = "initialized",
  InitializationError = "initializationError",
  LogEntry = "logEntry",
  BotError = "botError",
  BotKicked = "botKicked",
  BotEnd = "botEnd",
}

// --- Type Definitions ---
// Define a structure for parsed chat messages
interface ParsedChatMessage {
  isTargeted: boolean; // Is this message directed at this bot?
  isPrefixed: boolean; // Does it start with 'acronym:' or 'all:'?
  command: string; // The message content after the prefix (if any)
}

// Define the structure for messages between worker and main thread (example)
// You might want to create more specific types for each MessageType payload
interface WorkerMessage {
  type: MessageType;
  requestId?: string; // For correlating requests/responses like LLM
  payload: any; // Consider using a more specific union type based on 'type'
}

// --- Global Worker State ---
let agentBotInstance: AgentBot | null = null;
const botOptions = workerData as BotOptions; // Cast workerData once
const botUsername: string = botOptions.username;
const botAcronym: string | undefined = botOptions.acronym;

// LLM Proxy State
const llmRequestPromises = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason?: any) => void }
>();
let llmRequestIdCounter = 0;

// --- Utility Functions ---

/** Throws an error if the script is not running as a worker thread. */
function assertIsWorkerThread(): void {
  if (!parentPort) {
    throw new Error("This script must be run as a worker thread.");
  }
}

/** Throws an error if the bot's acronym is missing (needed for chat commands). */
function assertBotAcronym(acronym: string | undefined, context: string): asserts acronym is string {
   if (!acronym) {
      logError(`FATAL: Acronym is missing in workerData. Cannot ${context}.`);
      throw new Error(`Acronym missing for bot ${botUsername}`);
   }
}

/** Safely posts a message to the main thread, handling cases where parentPort might be null. */
function safePostMessage(message: WorkerMessage): void {
  if (parentPort) {
    parentPort.postMessage(message);
  } else {
    logWarn(`parentPort is null, cannot send message type: ${message.type}`);
  }
}

/** Prepends worker context to log messages. */
function logInfo(message: string, ...optionalParams: any[]): void {
  console.log(`[Worker ${botUsername}] ${message}`, ...optionalParams);
}

function logWarn(message: string, ...optionalParams: any[]): void {
  console.warn(`[Worker ${botUsername}] ${message}`, ...optionalParams);
}

function logError(message: string, ...optionalParams: any[]): void {
  console.error(`[Worker ${botUsername}] ${message}`, ...optionalParams);
}

// --- Initialization Functions ---

/** Creates the bot instance and sets up basic listeners. */
async function initializeBotInstance(options: BotOptions): Promise<AgentBot> {
  try {
    const bot = await createAgentBot(options);
    if (!bot) {
        throw new Error("createAgentBot returned null or undefined.");
    }
    logInfo(`Bot instance created.`);
    return bot;
  } catch (error) {
    logError("Failed during createAgentBot:", error);
    throw error; // Re-throw to be caught by the main initialization logic
  }
}

/** Sets up listeners for critical bot events (error, kicked, end). */
function setupBotEventListeners(botInstance: AgentBot): void {
    const { bot } = botInstance;

    bot.on("error", (err) => {
        logError("Bot Error:", err);
        safePostMessage({ type: MessageType.BotError, payload: { username: botUsername, error: String(err) } });
    });

    bot.on("kicked", (reason, loggedIn) => {
        logError(`Kicked: ${reason} (Logged In: ${loggedIn})`);
        safePostMessage({ type: MessageType.BotKicked, payload: { username: botUsername, reason } });
        process.exit(1); // Exit worker on kick
    });

    bot.on("end", (reason) => {
        logInfo(`Disconnected: ${reason}`);
        safePostMessage({ type: MessageType.BotEnd, payload: { username: botUsername, reason } });
        process.exit(0); // Exit worker on disconnect
    });

    logInfo("Critical bot event listeners (error, kicked, end) attached.");
}

/** Overrides SharedAgentState logging methods to post entries to the main thread. */
function setupStateLogging(botInstance: AgentBot): void {
    const sharedState = botInstance.sharedState;

    // Keep original methods for internal logging
    const originalLogMessage = sharedState.logMessage.bind(sharedState);
    const originalLogOpenAIRequest = sharedState.logOpenAIRequest.bind(sharedState);
    const originalLogOpenAIResponse = sharedState.logOpenAIResponse.bind(sharedState);
    const originalLogOpenAIError = sharedState.logOpenAIError.bind(sharedState);

    sharedState.logMessage = (role, content, metadata, functionName, functionArgs, functionResult) => {
        originalLogMessage(role, content, metadata, functionName, functionArgs, functionResult); // Keep internal log
        const entry = sharedState.conversationLog.slice(-1)[0]; // Get the entry just added
        if (entry) {
            safePostMessage({ type: MessageType.LogEntry, payload: { username: botUsername, entry } });
        }
    };

    // Override OpenAI logs to indicate they are proxied
    sharedState.logOpenAIRequest = (endpoint, payload) => {
        originalLogOpenAIRequest(endpoint, payload); // Log internally
        // Optional: Log minimal info for worker context if needed
        // originalLogMessage("api_request", `[Proxy Request] to ${endpoint}`, { store: payload.store });
        // Main thread handles the detailed logging via the proxy
    };

    sharedState.logOpenAIResponse = (endpoint, response) => {
        originalLogOpenAIResponse(endpoint, response); // Log internally
        // originalLogMessage("api_response", `[Proxy Response] from ${endpoint}`);
    };

    sharedState.logOpenAIError = (endpoint, error) => {
        originalLogOpenAIError(endpoint, error); // Log internally
        // originalLogMessage("api_error", `[Proxy Error] from ${endpoint}: ${String(error)}`);
    };

    logInfo("SharedAgentState logging overrides configured.");
}


// --- Chat Handling Logic ---

/**
 * Parses an incoming chat message to determine if it targets this bot and extracts the command.
 * @param message The raw chat message string.
 * @param currentBotUsername The username of this bot instance.
 * @param botAcronym The acronym for this bot, if any.
 * @returns ParsedChatMessage object.
 */
function parseChatMessage(message: string, currentBotUsername: string, botAcronym: string | undefined): ParsedChatMessage {
    const lowerMessage = message.toLowerCase();
    const botPrefix = botAcronym ? `${botAcronym}:`.toLowerCase() : null; // Calculate only if acronym exists
    const allPrefixLower = ALL_PREFIX.toLowerCase(); // Ensure comparison is case-insensitive

    let commandMessage = "";
    let isPrefixed = false;
    let isTargeted = false;

    if (botPrefix && lowerMessage.startsWith(botPrefix)) {
        commandMessage = message.substring(botPrefix.length).trim();
        isPrefixed = true;
        isTargeted = true;
        logInfo(`Targeted by own acronym prefix '${botPrefix}'.`);
    } else if (lowerMessage.startsWith(allPrefixLower)) {
        commandMessage = message.substring(ALL_PREFIX.length).trim(); // Use original length for substring
        isPrefixed = true;
        isTargeted = true; // 'all:' targets everyone
        logInfo(`Targeted by '${ALL_PREFIX}' prefix.`);
    } else {
        // No prefix matched, or bot has no acronym. Treat as general message.
        commandMessage = message.trim();
        isPrefixed = false;
        // Decide if non-prefixed messages should target the bot.
        // Assuming non-prefixed messages are potentially for this bot unless handled otherwise.
        isTargeted = true;
    }

    return { isTargeted, isPrefixed, command: commandMessage };
}

/** Handles "test" commands received in chat. */
async function handleTestCommand(agent: AgentBot, senderUsername: string, testCommandArgs: string): Promise<void> {
    logInfo(`Handling 'test' command: "${testCommandArgs}" from ${senderUsername}`);
    try {
        await handleChatTestCommand(agent, senderUsername, testCommandArgs);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`Error executing test command "${testCommandArgs}":`, errorMessage);
        agent.bot.chat(`[${agent.bot.username}] Error running test command: ${errorMessage}`);
    }
}

/** Handles general (non-test, non-prefixed) commands received in chat. */
async function handleGeneralCommand(agent: AgentBot, senderUsername: string, command: string): Promise<void> {
    const { observer, bot } = agent;
    // logInfo(`Handling non-prefixed, non-test command: "${command}" from ${senderUsername}`);

    switch (command.toLowerCase()) {
        case BLOCKS_COMMAND: {
            const result = await observer.getVisibleBlockTypes();
            const blocksStr = result?.BlockTypes
                ? Object.entries(result.BlockTypes)
                      .map(([name, { x, y, z }]) => `${name}@(${x.toFixed(0)},${y.toFixed(0)},${z.toFixed(0)})`)
                      .join(", ") || "None found"
                : "N/A (observer error?)";
            bot.chat(`Blocks: ${blocksStr}`);
            break;
        }
        case MOBS_COMMAND: {
            const result = await observer.getVisibleMobs();
            const mobsStr = result?.Mobs
                ? result.Mobs.map(mob => `${mob.name}(${mob.distance.toFixed(1)}m)`).join(", ") || "None found"
                : "N/A (observer error?)";
            bot.chat(`Mobs: ${mobsStr}`);
            break;
        }
        case TOME_COMMAND:
            logInfo(`Executing /tp command for user ${senderUsername}`);
            // IMPORTANT: Add permission checks here if necessary before executing sensitive commands
            // Example: if (isOp(senderUsername)) { bot.chat(`/tp ${senderUsername}`); }
            bot.chat(`/tp ${senderUsername}`); // Teleport the sender TO the bot
            break;

        default:
            // logInfo(`Unhandled non-prefixed command: "${command}"`);
            // Decide if you want to reply for unhandled commands
            // bot.chat(`Sorry ${senderUsername}, I don't understand "${command}".`);
            break;
    }
}

/** Sets up the main chat listener for the bot. */
function setupChatListener(agent: AgentBot): void {
    assertIsWorkerThread(); // Ensure parentPort exists before proceeding
    // Acronym is essential for command parsing logic with prefixes
    assertBotAcronym(botAcronym, "set up chat listener");

    const { bot } = agent;
    const currentBotUsername = bot.username;

    // Remove existing listener to prevent duplicates if this function is called again
    bot.removeAllListeners("chat");
    logInfo("Attaching chat listener...");

    bot.on("chat", async (username: string, message: string /*, translate, jsonMsg, matches */) => {
        // Ignore messages sent by the bot itself
        if (username === currentBotUsername) return;

        const parsed = parseChatMessage(message, currentBotUsername, botAcronym);

        if (!parsed.isTargeted) {
           // logInfo(`Ignoring message not targeted at this bot: "${message}"`);
           return;
        }

        // Handle "test" command specifically (works whether prefixed or not, if targeted)
        if (parsed.command.toLowerCase().startsWith(TEST_COMMAND_PREFIX)) {
            const testArgs = parsed.command.substring(TEST_COMMAND_PREFIX.length).trim();
            await handleTestCommand(agent, username, testArgs);
        }
        // Handle other commands ONLY if they were NOT prefixed
        else if (!parsed.isPrefixed) {
            await handleGeneralCommand(agent, username, parsed.command);
        } else {
            // Message was prefixed (e.g., "ab: some command") but wasn't "test"
             logInfo(`Ignoring prefixed, non-test command: "${parsed.command}"`);
        }
    });
}


// --- Main Thread Message Handling ---

/** Handles the 'getState' request from the main thread. */
function handleGetState(instance: AgentBot): void {
    try {
        const state = serializeSharedState(instance.sharedState);
        safePostMessage({
            type: MessageType.StateUpdate,
            payload: { username: botUsername, state },
        });
    } catch (error) {
        logError("Error serializing state:", error);
        // Optionally notify main thread of the error
    }
}

/** Handles the 'llmResponse' message from the main thread's proxy. */
function handleLlmResponse(message: WorkerMessage): void {
    const requestId = message.requestId;
    if (!requestId) {
        logWarn("Received LLM response without a requestId.");
        return;
    }

    const resolver = llmRequestPromises.get(requestId);
    if (resolver) {
        logInfo(`Received LLM response for request ${requestId}`);
        if (message.payload.error) {
            resolver.reject(new Error(message.payload.error));
        } else {
            resolver.resolve(message.payload.response);
        }
        llmRequestPromises.delete(requestId);
    } else {
        logWarn(`No promise found for LLM response ID ${requestId}`);
    }
}

/** Handles the 'startGoalPlan' request from the main thread. */
async function handleStartGoalPlan(instance: AgentBot, message: WorkerMessage): Promise<void> {
    logInfo(`Received startGoalPlan request: ${message.payload.goal}`);
    try {
        const tree: StepNode[] = await buildGoalTree(
            message.payload.goal,
            message.payload.mode,
            (updatedTree: StepNode[]) => {
                // Send progress update
                safePostMessage({
                    type: MessageType.GoalPlanProgress,
                    payload: { username: botUsername, tree: updatedTree },
                });
            },
            instance.sharedState // Pass worker's state
        );
        // Send final result
        safePostMessage({
            type: MessageType.GoalPlanComplete,
            payload: { username: botUsername, tree },
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown goal planning error";
        logError("Error during goal planning:", errorMessage);
        safePostMessage({
            type: MessageType.GoalPlanError,
            payload: { username: botUsername, error: errorMessage },
        });
    }
}

/** Main message handler for messages received from the parent thread. */
function setupMessageListener(): void {
    if(!parentPort){
      throw new Error("ParentPort is null");
    }
    assertIsWorkerThread();
    parentPort.on("message", async (message: WorkerMessage) => {
        if (!agentBotInstance) {
            logWarn(`Received message type ${message.type} before initialization.`);
            return;
        }

        // logInfo(`Received message type: ${message.type}`); // Less verbose logging

        switch (message.type) {
            case MessageType.GetState:
                handleGetState(agentBotInstance);
                break;

            case MessageType.LlmResponse:
                handleLlmResponse(message);
                break;

            case MessageType.StartGoalPlan:
                await handleStartGoalPlan(agentBotInstance, message);
                break;

            // Add handlers for other commands if needed

            default:
                logWarn(`Received unknown message type: ${message.type}`);
        }
    });
    logInfo("Main thread message listener attached.");
}


// --- LLM Proxy Function ---

/**
 * Sends an LLM request to the main thread via postMessage and returns a promise
 * that resolves/rejects when the main thread sends back the response.
 * @param type The type of LLM request ('chat' or 'json').
 * @param payload The data for the LLM request.
 * @returns A promise that resolves with the LLM response or rejects with an error.
 */
export function proxyLLMRequest(type: "chat" | "json", payload: any): Promise<any> {
    assertIsWorkerThread(); // Ensure parentPort is available

    const requestId = `${botUsername}_${llmRequestIdCounter++}`;
    const promise = new Promise((resolve, reject) => {
        llmRequestPromises.set(requestId, { resolve, reject });

        safePostMessage({
            type: MessageType.LlmRequest,
            requestId: requestId,
            payload: { type, data: payload },
        });

        // Optional: Implement a timeout for LLM requests
        // setTimeout(() => {
        //   if (llmRequestPromises.has(requestId)) {
        //     llmRequestPromises.delete(requestId);
        //     reject(new Error(`LLM request ${requestId} timed out.`));
        //   }
        // }, 30000); // 30 seconds timeout
    });

    return promise;
}


// --- Worker Initialization Sequence ---

/** Main function to initialize and run the bot worker. */
async function runWorker(): Promise<void> {
    assertIsWorkerThread();
    logInfo(`Initializing... Acronym: '${botAcronym || "(none)"}'`);

    try {
        agentBotInstance = await initializeBotInstance(botOptions);

        setupBotEventListeners(agentBotInstance);
        setupStateLogging(agentBotInstance);
        setupChatListener(agentBotInstance); // Setup chat listener AFTER instance exists
        setupMessageListener(); // Setup listener for main thread messages

        // Signal main thread that initialization is complete
        safePostMessage({ type: MessageType.Initialized, payload: { username: botUsername } });
        logInfo("Initialization complete. Worker is ready.");

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logError(`Worker initialization failed: ${errorMessage}`);
        safePostMessage({
            type: MessageType.InitializationError,
            payload: { username: botUsername, error: errorMessage },
        });
        process.exit(1); // Exit if initialization fails critically
    }
}

// --- Start the Worker ---
runWorker().catch(error => {
    // This catch is a final safety net, although runWorker() should handle its errors.
    logError("Unhandled error during worker execution:", error);
    process.exit(1);
});