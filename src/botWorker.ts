// src/botWorker.ts
import dotenv from 'dotenv';
import { parentPort, workerData } from 'worker_threads';
import { AgentBot, BotOptions, createAgentBot } from './createAgentBot';
import { StepNode, buildGoalTree } from './goalPlanner';
// Import the actual SerializedState interface and the serialize function
import { SerializedState, serializeSharedState } from './server/serverUtils'; // Adjusted path and added import
import { handleChatTestCommand } from './chatTests';
import type { LogEntry } from '../types/log.types';
import OpenAI from 'openai'; // Keep for OpenAI type definitions

dotenv.config();

// --- Defined Types based on server implementation ---

// For LlmRequest type='chat'
export interface ChatRequestData {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  model?: string; // Optional as server provides default
  tools?: OpenAI.Chat.ChatCompletionTool[];
  tool_choice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
  parallel_tool_calls?: boolean; // Added based on server usage
  // Add other potential parameters used by openai.chat.completions.create if needed
}

// For LlmRequest type='json'
export interface JsonRequestData {
  systemMsg: string;
  userMsg: string;
  jsonSchema: unknown; // Type accurately if a JSON schema type definition is available
  // Add other parameters used by callLLMJsonSchema if needed
}

// Type for the parsed JSON response from 'json' mode LLM calls
type ParsedJsonResponse = unknown; // Or a more specific type/generic if possible

// --- Constants ---
const ALL_PREFIX = 'all:';
const TEST_COMMAND_PREFIX = 'test ';
const BLOCKS_COMMAND = 'blocks';
const MOBS_COMMAND = 'mobs';
const TOME_COMMAND = 'tome';

// --- Message Types and Payloads ---
export enum MessageType {
  GetState = 'getState',
  StateUpdate = 'stateUpdate',
  LlmRequest = 'llmRequest',
  LlmResponse = 'llmResponse',
  StartGoalPlan = 'startGoalPlan',
  GoalPlanProgress = 'goalPlanProgress',
  GoalPlanComplete = 'goalPlanComplete',
  GoalPlanError = 'goalPlanError',
  Initialized = 'initialized',
  InitializationError = 'initializationError',
  LogEntry = 'logEntry',
  BotError = 'botError',
  BotKicked = 'botKicked',
  BotEnd = 'botEnd',
}

// Specific Payload Interfaces
interface StateUpdatePayload { username: string; state: SerializedState; } // Use imported SerializedState
// LlmRequestPayload uses specific data types based on 'type' discriminator (handled in WorkerMessage union)
export interface LlmResponsePayload {
    response?: unknown; // Simplified from unknown | undefined, as unknown includes undefined
    error?: string;
}
export interface StartGoalPlanPayload { goal: string; mode: 'bfs' | 'dfs'; }
export interface GoalPlanProgressPayload { username: string; tree: StepNode[]; }
export interface GoalPlanCompletePayload { username: string; tree: StepNode[]; }
export interface GoalPlanErrorPayload { username: string; error: string; }
export interface InitializedPayload { username: string; }
export interface InitializationErrorPayload { username: string; error: string; }
export interface LogEntryPayload { username: string; entry: LogEntry; }
export interface BotErrorPayload { username: string; error: string; }
export interface BotKickedPayload { username: string; reason: string; }
export interface BotEndPayload { username: string; reason: string; }

// Discriminated Union for Worker Messages
export type WorkerMessage =
  | { type: MessageType.GetState; requestId?: string }
  | { type: MessageType.StateUpdate; requestId?: string; payload: StateUpdatePayload }
  // Refined LlmRequest: payload depends on type discriminator
  | { type: MessageType.LlmRequest; requestId: string; payload: { type: 'chat', data: ChatRequestData } }
  | { type: MessageType.LlmRequest; requestId: string; payload: { type: 'json', data: JsonRequestData } }
  // LlmResponse payload structure is consistent, but 'response' content type varies
  | { type: MessageType.LlmResponse; requestId: string; payload: LlmResponsePayload }
  | { type: MessageType.StartGoalPlan; requestId?: string; payload: StartGoalPlanPayload }
  | { type: MessageType.GoalPlanProgress; requestId?: string; payload: GoalPlanProgressPayload }
  | { type: MessageType.GoalPlanComplete; requestId?: string; payload: GoalPlanCompletePayload }
  | { type: MessageType.GoalPlanError; requestId?: string; payload: GoalPlanErrorPayload }
  | { type: MessageType.Initialized; requestId?: string; payload: InitializedPayload }
  | { type: MessageType.InitializationError; requestId?: string; payload: InitializationErrorPayload }
  | { type: MessageType.LogEntry; requestId?: string; payload: LogEntryPayload }
  | { type: MessageType.BotError; requestId?: string; payload: BotErrorPayload }
  | { type: MessageType.BotKicked; requestId?: string; payload: BotKickedPayload }
  | { type: MessageType.BotEnd; requestId?: string; payload: BotEndPayload };


interface ParsedChatMessage {
  isTargeted: boolean;
  isPrefixed: boolean;
  command: string;
}

// --- Global Worker State ---
let agentBotInstance: AgentBot | null = null;
const botOptions = workerData as BotOptions;
const botUsername: string = botOptions.username;
const botAcronym: string | undefined = botOptions.acronym;

// LLM Proxy State - resolve type depends on what handleLlmResponse resolves with
const llmRequestPromises = new Map<
  string,
  {
    resolve: (value: unknown) => void; // Simplified resolve type (unknown | undefined) -> unknown
    reject: (reason?: unknown) => void;
    requestType: 'chat' | 'json'; // Store the original request type
  }
>();
let llmRequestIdCounter = 0;

// --- Utility Functions (Unchanged) ---
function assertIsWorkerThread(): void {
  if (!parentPort) {
    throw new Error('This script must be run as a worker thread.');
  }
}

function safePostMessage(message: WorkerMessage): void {
  if (parentPort) {
    parentPort.postMessage(message);
  } else {
    logWarn(`parentPort is null, cannot send message type: ${message.type}`);
  }
}

function logInfo(message: string, ...optionalParams: unknown[]): void {
  console.log(`[Worker ${botUsername}] ${message}`, ...optionalParams);
}

function logWarn(message: string, ...optionalParams: unknown[]): void {
  console.warn(`[Worker ${botUsername}] ${message}`, ...optionalParams);
}

function logError(message: string, ...optionalParams: unknown[]): void {
  console.error(`[Worker ${botUsername}] ${message}`, ...optionalParams);
}

// --- Initialization Functions (Unchanged) ---
async function initializeBotInstance(options: BotOptions): Promise<AgentBot> {
  try {
    const bot = await createAgentBot(options);
    if (!bot) {
      throw new Error('createAgentBot returned null or undefined.');
    }
    logInfo('Bot instance created.');
    return bot;
  } catch (error) {
    logError('Failed during createAgentBot:', error);
    throw error;
  }
}

function setupBotEventListeners(botInstance: AgentBot): void {
  const { bot } = botInstance;

  bot.on('error', (err) => {
    logError('Bot Error:', err);
    safePostMessage({
      type: MessageType.BotError,
      payload: { username: botUsername, error: String(err) },
    });
  });

  bot.on('kicked', (reason, loggedIn) => {
    logError(`Kicked: ${reason} (Logged In: ${loggedIn})`);
    safePostMessage({
      type: MessageType.BotKicked,
      payload: { username: botUsername, reason },
    });
    process.exit(1);
  });

  bot.on('end', (reason) => {
    logInfo(`Disconnected: ${reason}`);
    safePostMessage({
      type: MessageType.BotEnd,
      payload: { username: botUsername, reason },
    });
    process.exit(0);
  });

  logInfo('Critical bot event listeners (error, kicked, end) attached.');
}

function setupStateLogging(botInstance: AgentBot): void {
  const sharedState = botInstance.sharedState;

  const originalLogMessage = sharedState.logMessage.bind(sharedState);
  const originalLogOpenAIRequest = sharedState.logOpenAIRequest.bind(sharedState);
  const originalLogOpenAIResponse = sharedState.logOpenAIResponse.bind(sharedState);
  const originalLogOpenAIError = sharedState.logOpenAIError.bind(sharedState);

  sharedState.logMessage = (
    role,
    content,
    metadata,
    functionName,
    functionArgs,
    functionResult
  ) => {
    originalLogMessage(
      role,
      content,
      metadata,
      functionName,
      functionArgs,
      functionResult
    );
    const entry = sharedState.conversationLog?.slice(-1)?.[0];
    if (entry) {
      safePostMessage({
        type: MessageType.LogEntry,
        payload: { username: botUsername, entry },
      });
    }
  };

  sharedState.logOpenAIRequest = (endpoint, payload) => {
    originalLogOpenAIRequest(endpoint, payload);
  };

  // Corrected: Ensure logOpenAIResponse uses unknown type
  sharedState.logOpenAIResponse = (endpoint: string, response: unknown) => { // Type is unknown
    // Type guard remains necessary as response is unknown
    if (typeof response === 'object' && response !== null && 'choices' in response) {
         originalLogOpenAIResponse(endpoint, response as OpenAI.Chat.Completions.ChatCompletion);
    } else {
        logWarn(`[State Logging] logOpenAIResponse received non-ChatCompletion object for endpoint ${endpoint}:`, response);
        // Handle logging of unknown response structure if necessary
        // Depending on requirements, you might still want to log the 'unknown' structure here
        // originalLogOpenAIResponse(endpoint, response); // This might cause downstream type errors if original expects ChatCompletion
    }
  };


  sharedState.logOpenAIError = (endpoint, error) => {
    originalLogOpenAIError(endpoint, error);
  };

  logInfo('SharedAgentState logging overrides configured.');
}


// --- Chat Handling Logic (Largely Unchanged, check observer usage) ---
function parseChatMessage(
  message: string,
  botAcronymValue: string | undefined
): ParsedChatMessage {
    const lowerMessage = message.toLowerCase();
    const botPrefix = botAcronymValue ? botAcronymValue.toLowerCase() : undefined;
    const allPrefixLower = ALL_PREFIX.toLowerCase();

    let commandMessage = '';
    let isPrefixed = false;
    let isTargeted = false;

    if (botPrefix && lowerMessage.startsWith(botPrefix)) {
        commandMessage = message.substring(botAcronymValue!.length).trim();
        isPrefixed = true;
        isTargeted = true;
        logInfo(`Targeted by own acronym prefix '${botAcronymValue!}'.`);
    } else if (lowerMessage.startsWith(allPrefixLower)) {
        commandMessage = message.substring(ALL_PREFIX.length).trim();
        isPrefixed = true;
        isTargeted = true;
        logInfo(`Targeted by '${ALL_PREFIX}' prefix.`);
    } else {
        commandMessage = message.trim();
        isPrefixed = false;
        // Assuming non-prefixed messages are still targeted for processing/logging
        isTargeted = true;
    }

    return { isTargeted, isPrefixed, command: commandMessage };
}


async function handleTestCommand(
  agent: AgentBot,
  senderUsername: string,
  testCommandArgs: string
): Promise<void> {
  logInfo(
    `Handling 'test' command: "${testCommandArgs}" from ${senderUsername}`
  );
  try {
    await handleChatTestCommand(agent, senderUsername, testCommandArgs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(
      `Error executing test command "${testCommandArgs}":`,
      errorMessage
    );
    agent.bot.chat(
      `[${agent.bot.username}] Error running test command: ${errorMessage}`
    );
  }
}

async function handleGeneralCommand(
  agent: AgentBot,
  senderUsername: string,
  command: string
): Promise<void> {
  const { observer, bot } = agent;
   if (!observer) {
      logError("Observer not found in handleGeneralCommand");
      return;
   }

  switch (command.toLowerCase()) {
    case BLOCKS_COMMAND: {
      const result = await observer.getVisibleBlockTypes();
      const blocksStr = result?.BlockTypes
        ? Object.entries(result.BlockTypes)
            .map(
              ([name, { x, y, z }]) =>
                `${name}@(${x.toFixed(0)},${y.toFixed(0)},${z.toFixed(0)})`
            )
            .join(', ') || 'None found'
        : 'N/A (observer error?)';
      bot.chat(`Blocks: ${blocksStr}`);
      break;
    }
    case MOBS_COMMAND: {
      const result = await observer.getVisibleMobs();
      const mobsStr = result?.Mobs
        ? result.Mobs.map(
            (mob) => `${mob.name}(${mob.distance.toFixed(1)}m)`
          ).join(', ') || 'None found'
        : 'N/A (observer error?)';
      bot.chat(`Mobs: ${mobsStr}`);
      break;
    }
    case TOME_COMMAND:
      logInfo(`Executing /tp command for user ${senderUsername}`);
      bot.chat(`/tp ${senderUsername}`);
      break;

    default:
       logInfo(`Ignoring unknown general command: ${command}`);
      break;
  }
}

function setupChatListener(agent: AgentBot): void {
    assertIsWorkerThread();

    const currentBotAcronym = botAcronym;

    if (!currentBotAcronym) {
        logWarn('Bot acronym is missing, prefix matching might not work as expected.');
    }

    const { bot, observer } = agent;
    const currentBotUsername = bot.username;

    if (!observer) {
        logError('Observer not available! Cannot handle chat messages properly.');
        return;
    }
    // Ensure observer.recentChats is expected structure before using push
    if (!observer.recentChats || !Array.isArray(observer.recentChats)) {
         logError('observer.recentChats is missing or not an array! Cannot store chat.');
         // Decide if this is fatal or if chat can proceed without storing
         // Initialize it perhaps?
         // observer.recentChats = []; // Uncomment to initialize if missing
         // return; // Uncomment to make it fatal
    }

    bot.removeAllListeners('chat');
    logInfo('Attaching chat listener in botWorker...');

    bot.on('chat', async (username: string, message: string) => {
        if (username === currentBotUsername) return; // Ignore self

        const parsed = parseChatMessage(message, currentBotAcronym);

        logInfo(`Parsed chat from ${username}: Targeted=${parsed.isTargeted}, Prefixed=${parsed.isPrefixed}, Command="${parsed.command}"`);

        // Store all non-self messages in recentChats if observer exists and has the array
        if (observer.recentChats && Array.isArray(observer.recentChats)) {
            const formattedMessage = `${username}: ${message}`;
            observer.recentChats.push(formattedMessage);
            // Optional: Keep recentChats capped to a certain size
            // if (observer.recentChats.length > MAX_RECENT_CHATS) {
            //     observer.recentChats.shift();
            // }
        }

        // Handle 'test' command regardless of prefix (if it starts with 'test ')
        if (parsed.command.toLowerCase().startsWith(TEST_COMMAND_PREFIX)) {
            const testArgs = parsed.command.substring(TEST_COMMAND_PREFIX.length).trim();
            logInfo(`Handling as TEST command: "${testArgs}"`);
            await handleTestCommand(agent, username, testArgs);
        }
        // Handle built-in commands only if prefixed OR if it's one of the specific non-prefixed allowed commands
        else if (parsed.isPrefixed || [BLOCKS_COMMAND, MOBS_COMMAND, TOME_COMMAND].includes(parsed.command.toLowerCase())) {
             const lowerCommand = parsed.command.toLowerCase();
             if ([BLOCKS_COMMAND, MOBS_COMMAND, TOME_COMMAND].includes(lowerCommand)) {
                 logInfo(`Handling as BUILT-IN command: "${parsed.command}"`);
                 await handleGeneralCommand(agent, username, parsed.command);
             } else if (parsed.isPrefixed) {
                 // If it was prefixed but wasn't 'test' or a known built-in, maybe pass to LLM or log?
                 logInfo(`Received prefixed command, but not 'test' or known built-in: "${parsed.command}". Passing to observer.`);
                 // The message is already added to recentChats above. Further LLM processing would happen elsewhere.
             }
        } else {
            // Non-prefixed, non-test, non-built-in command message.
            // Already added to recentChats. No further action needed here.
            logInfo(`Received non-prefixed, non-test, non-builtin message: "${parsed.command}". Logged in observer.`);
        }
    });
}


// --- Main Thread Message Handling ---

function handleGetState(instance: AgentBot): void {
  try {
    // Use the imported serializeSharedState function
    const state: SerializedState = serializeSharedState(instance.sharedState);
    safePostMessage({
      type: MessageType.StateUpdate,
      payload: { username: botUsername, state },
    });
  } catch (error) {
    logError('Error serializing state:', error);
    // Optionally send an error back to the main thread
  }
}

// Handle LlmResponse, resolving the correct promise type
function handleLlmResponse(payload: LlmResponsePayload, requestId: string): void {
  const resolver = llmRequestPromises.get(requestId);
  if (resolver) {
    logInfo(`Received LLM response for request ${requestId} (Type: ${resolver.requestType})`);
    if (payload.error) {
      resolver.reject(new Error(payload.error));
    } else {
      // Resolve with the received response (type is unknown)
      // The value `undefined` is assignable to `unknown` if payload.response is missing.
      resolver.resolve(payload.response);
    }
    llmRequestPromises.delete(requestId);
  } else {
    logWarn(`No promise found for LLM response ID ${requestId}`);
  }
}


async function handleStartGoalPlan(
  instance: AgentBot,
  payload: StartGoalPlanPayload
): Promise<void> {
  logInfo(`Received startGoalPlan request: ${payload.goal}`);
  try {
    const tree: StepNode[] = await buildGoalTree(
      payload.goal,
      payload.mode,
      (updatedTree: StepNode[]) => {
        safePostMessage({
          type: MessageType.GoalPlanProgress,
          payload: { username: botUsername, tree: updatedTree },
        });
      },
      instance.sharedState
    );
    safePostMessage({
      type: MessageType.GoalPlanComplete,
      payload: { username: botUsername, tree },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown goal planning error';
    logError('Error during goal planning:', errorMessage);
    safePostMessage({
      type: MessageType.GoalPlanError,
      payload: { username: botUsername, error: errorMessage },
    });
  }
}

function setupMessageListener(): void {
  if (!parentPort) {
    throw new Error('ParentPort is null');
  }
  assertIsWorkerThread();
  parentPort.on('message', (message: WorkerMessage) => {
    (async () => {
      if (!agentBotInstance) {
        logWarn(`Received message type ${message.type} before initialization.`);
        return;
      }

      switch (message.type) {
        case MessageType.GetState:
          handleGetState(agentBotInstance);
          break;

        case MessageType.LlmResponse:
          // No need to check message.requestId here, handleLlmResponse does it
          handleLlmResponse(message.payload, message.requestId);
          break;

        case MessageType.StartGoalPlan:
           // Check if payload exists (it should based on the type definition)
           if (message.payload) {
               await handleStartGoalPlan(agentBotInstance, message.payload);
           } else {
               logWarn(`Received ${message.type} message without payload.`);
           }
          break;

        // Add cases for other message types if needed...
        // case MessageType.StateUpdate: // Example: Should worker handle state updates?
        // case MessageType.LlmRequest: // Example: Should worker handle requests meant for main?
        // etc.

        default:
           // Use message.type directly, removed 'as any' cast
          logWarn(`Received unhandled message type: ${message.type}`);
      }
    })().catch(err => {
        logError('Error in message handler:', err);
         // Optionally send an error back to the main thread if the handler fails
        // safePostMessage({ type: MessageType.BotError, payload: { username: botUsername, error: String(err) } });
    });
  });
  logInfo('Main thread message listener attached.');
}

// --- LLM Proxy Function (Overloaded) ---

// Overload for 'chat' requests
export function proxyLLMRequest(
    type: 'chat',
    data: ChatRequestData
): Promise<OpenAI.Chat.Completions.ChatCompletion>; // Keep specific type here for callers

// Overload for 'json' requests
export function proxyLLMRequest(
    type: 'json',
    data: JsonRequestData
): Promise<ParsedJsonResponse>; // ParsedJsonResponse is unknown


// Implementation signature
export function proxyLLMRequest(
    type: 'chat' | 'json',
    data: ChatRequestData | JsonRequestData
): Promise<unknown> { // Implementation returns Promise<unknown> due to union simplification
  assertIsWorkerThread();

  const requestId = `${botUsername}_${llmRequestIdCounter++}`;

  // Construct the specific message object based on the type
  let messageToSend: WorkerMessage;
  if (type === 'chat') {
      messageToSend = {
          type: MessageType.LlmRequest,
          requestId: requestId,
          payload: { type: 'chat', data: data as ChatRequestData }
      };
  } else { // type === 'json'
      messageToSend = {
          type: MessageType.LlmRequest,
          requestId: requestId,
          payload: { type: 'json', data: data as JsonRequestData }
      };
  }

  // Promise resolves with 'unknown' because the response could be ChatCompletion or ParsedJsonResponse (unknown)
  const promise = new Promise<unknown>((resolve, reject) => {
     // Store the original request type along with resolvers
    llmRequestPromises.set(requestId, { resolve, reject, requestType: type });
    safePostMessage(messageToSend); // Send the correctly typed message
  });

  // Type assertion might be needed where this promise is awaited, based on the original 'type' requested
  return promise;
}


// --- Worker Initialization Sequence (Unchanged) ---

async function runWorker(): Promise<void> {
  assertIsWorkerThread();
  logInfo(`Initializing... Acronym: '${botAcronym || '(none)'}'`);

  try {
    agentBotInstance = await initializeBotInstance(botOptions);

    setupBotEventListeners(agentBotInstance);
    setupStateLogging(agentBotInstance);
    setupChatListener(agentBotInstance);
    setupMessageListener();

    safePostMessage({
      type: MessageType.Initialized,
      payload: { username: botUsername },
    });
    logInfo('Initialization complete. Worker is ready.');
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logError(`Worker initialization failed: ${errorMessage}`);
    safePostMessage({
      type: MessageType.InitializationError,
      payload: { username: botUsername, error: errorMessage },
    });
    process.exit(1);
  }
}

// --- Start the Worker ---
runWorker().catch((error) => {
  logError('Unhandled error during worker execution:', error);
  process.exit(1);
});