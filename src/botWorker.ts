// src/botWorker.ts
import dotenv from "dotenv";
import { parentPort, workerData } from "worker_threads";
import { AgentBot, BotOptions, createAgentBot } from "./createAgentBot"; // Adjust path if needed
import { StepNode, buildGoalTree } from "./goalPlanner"; // Adjust path
import { serializeSharedState } from "./server/serverUtils"; // Adjust path
import { handleChatTestCommand } from "./chatTests";
dotenv.config(); // Ensure worker loads environment variables

if (!parentPort) throw new Error("This script must be run as a worker thread.");

let agentBotInstance: AgentBot | null = null;
const botUsername: string = (workerData as BotOptions).username; // Get username early for logging

console.log(`[Worker ${botUsername}] Initializing...`);

// Helper function to set up listeners to avoid repetition
function setupChatListener(listeningAgent: AgentBot) {
  if (!parentPort)
    throw new Error("setupChatListener must be run on a worker thread.");
  const { bot: listeningBot } = listeningAgent;
  const currentBotUsername = listeningBot.username; // Get the username for checks

  // Ensure this listener isn't added multiple times
  listeningBot.removeAllListeners("chat");

  console.log(`[Worker ${currentBotUsername}] Attaching chat listener...`);

  listeningBot.on("chat", async (username: string, message: string) => {
    // Ignore messages sent by the bot itself
    if (username === currentBotUsername) return;

    // console.log(
    //   `[Worker ${currentBotUsername}] Received chat: "${message}" from ${username}`
    // );

    let targetBots: AgentBot[] = []; // Bots targeted by this command IN THIS WORKER
    let commandMessage: string = "";
    let isPrefixed = false;
    let isTargeted = false; // Was this specific bot instance targeted?

    // 1. Determine Target and Command Message based on prefix (Worker Context Aware)
    if (message.startsWith("ab:")) {
      commandMessage = message.substring(3).trim();
      isPrefixed = true;
      // Check if THIS bot is AgentBot
      if (currentBotUsername === "AgentBot") {
        targetBots = [listeningAgent]; // Target self
        isTargeted = true;
        console.log(`[Worker ${currentBotUsername}] Targeted by 'ab:' prefix.`);
      } else {

        return;
      }
    } else if (message.startsWith("dbb:")) {
      commandMessage = message.substring(4).trim();
      isPrefixed = true;
      // Check if THIS bot is DaBiggestBird
      if (currentBotUsername === "DaBiggestBird") {
        targetBots = [listeningAgent]; // Target self
        isTargeted = true;
        console.log(
          `[Worker ${currentBotUsername}] Targeted by 'dbb:' prefix.`
        );
      } else {
        // This listener is for ab, ignore 'dbb:'
        console.log(
          `[Worker ${currentBotUsername}] Ignoring 'dbb:' prefix (I am not DaBiggestBird).`
        );
        return;
      }
    } else if (message.startsWith("all:")) {
      commandMessage = message.substring(4).trim();
      isPrefixed = true;
      // *** SIMPLIFICATION for Worker Context ***
      // This worker can only target itself. True 'all' needs inter-worker comms.
      targetBots = [listeningAgent];
      isTargeted = true; // Mark as targeted because 'all' was used
      console.log(
        `[Worker ${currentBotUsername}] Targeted by 'all:' prefix (targeting self only).`
      );
    } else {
      // Default: No prefix, command applies only to the bot receiving it
      targetBots = [listeningAgent]; // Target self
      commandMessage = message.trim(); // Trim the raw message
      isPrefixed = false;
      isTargeted = true; // Default commands always target the listener
    }

    // If this bot wasn't targeted by logic above, stop.
    // (This check might be redundant now but safe to keep)
    if (!isTargeted) {
      // console.log(
      //   `[Worker ${currentBotUsername}] Not targeted by command, ignoring`
      // );
      return;
    }

    // 2. Check if it's a "test" command and execute
    if (commandMessage.startsWith("test ")) {
      const testCommand = commandMessage.substring(5).trim();
      console.log(
        `[Worker ${currentBotUsername}] Handling 'test' command: "${testCommand}" for targets:`,
        targetBots.map((b) => b.bot.username)
      );

      // Execute the test command for targets identified (usually just self in worker)
      for (const targetAgent of targetBots) {
        // In the worker context, targetBots only contains listeningAgent
        if (targetAgent === listeningAgent) {
          await handleChatTestCommand(targetAgent, username, testCommand);
        }
      }
    }
    // 3. Handle non-test commands (only if NOT prefixed)
    // The original logic only ran these for non-prefixed messages.
    // Prefixed commands that aren't "test" are ignored below this block.
    else if (!isPrefixed) {
      const { observer, navigation } = listeningAgent;
      // console.log(
      //   `[Worker ${currentBotUsername}] Handling non-prefixed, non-test command: "${commandMessage}"`
      // );
      switch (commandMessage) {
        case "blocks": {
          const visibleBlocksResult = await observer.getVisibleBlockTypes();
          // Ensure BlockTypes exists before trying to access it
          const blocksStr = visibleBlocksResult?.BlockTypes
            ? Object.entries(visibleBlocksResult.BlockTypes)
                .map(
                  ([blockName, { x, y, z }]) =>
                    `${blockName}@(${x.toFixed(0)},${y.toFixed(0)},${z.toFixed(
                      0
                    )})`
                )
                .join(", ")
            : "N/A";
          listeningBot.chat(
            `Blocks: ${blocksStr || "None"}`
          );
          break;
        }
        case "mobs": {
          const visibleMobsResult = await observer.getVisibleMobs();
          // Ensure Mobs exists before trying to access it
          const mobsStr = visibleMobsResult?.Mobs
            ? visibleMobsResult.Mobs.map(
                (mob) => `${mob.name}(${mob.distance.toFixed(1)}m)`
              ).join(", ")
            : "N/A";
          listeningBot.chat(
            `Mobs: ${mobsStr || "None"}`
          );
          break;
        }
        case "tome":
          console.log(
            `[Worker ${currentBotUsername}] Matched 'tome'. Executing: /tp ${username}`
          );
          listeningBot.chat(`/tp jibbum`)
          // Check for OP permissions before sending command

          break;


        default:
          // console.log(
          //   `[Worker ${currentBotUsername}] Unhandled non-prefixed command: "${commandMessage}"`
          // );
          break;
      }
    }

    // If the message was prefixed ('ab:', 'dbb:', 'all:') but *not* a 'test' command, it's ignored here.
    else {
      console.log(
        // `[Worker ${currentBotUsername}] Ignoring prefixed non-test command: "${commandMessage}"`
      );
    }
  });
}

// Function to safely post messages (handles potential null parentPort during shutdown)
function safePostMessage(message: any) {
  if (parentPort) {
    parentPort.postMessage(message);
  } else {
    console.warn(
      `[Worker ${botUsername}] parentPort is null, cannot send message:`,
      message
    );
  }
}

// --- Main Worker Logic ---
async function initializeBot() {
  try {
    const botOptions = workerData as BotOptions;
    agentBotInstance = await createAgentBot(botOptions);
    if (agentBotInstance) {
      setupChatListener(agentBotInstance); // Call the listener setup
    } else {
       console.error(`[Worker ${botUsername}] agentBotInstance is null after creation! Cannot attach listener.`);
    }

    console.log(`[Worker ${botUsername}] Bot instance created and spawned.`);

    // Override log methods in SharedAgentState to post messages
    const originalLogMessage = agentBotInstance.sharedState.logMessage.bind(
      agentBotInstance.sharedState
    );
    agentBotInstance.sharedState.logMessage = (
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
      ); // Keep internal log
      const entry = agentBotInstance?.sharedState.conversationLog.slice(-1)[0]; // Get the entry just added
      if (entry) {
        safePostMessage({
          type: "logEntry",
          payload: { username: botUsername, entry },
        });
      }
    };
    // Override specific OpenAI log methods to prevent direct logging if handled by main thread proxy
    agentBotInstance.sharedState.logOpenAIRequest = (endpoint, payload) => {
      // We rely on main thread logging this via the proxy
      // Optionally log minimal info here if needed for worker context
      originalLogMessage("api_request", `[Proxy Request] to ${endpoint}`, {
        store: payload.store,
      });
    };
    agentBotInstance.sharedState.logOpenAIResponse = (endpoint, response) => {
      originalLogMessage("api_response", `[Proxy Response] from ${endpoint}`);
    };
    agentBotInstance.sharedState.logOpenAIError = (endpoint, error) => {
      originalLogMessage(
        "api_error",
        `[Proxy Error] from ${endpoint}: ${String(error)}`
      );
    };

    agentBotInstance.bot.on("error", (err) => {
      console.error(`[Worker ${botUsername}] Bot Error:`, err);
      safePostMessage({
        type: "botError",
        payload: { username: botUsername, error: String(err) },
      });
    });

    agentBotInstance.bot.on("kicked", (reason) => {
      console.error(`[Worker ${botUsername}] Kicked:`, reason);
      safePostMessage({
        type: "botKicked",
        payload: { username: botUsername, reason },
      });
      process.exit(1); // Exit worker on kick
    });

    agentBotInstance.bot.on("end", (reason) => {
      console.log(`[Worker ${botUsername}] Disconnected:`, reason);
      safePostMessage({
        type: "botEnd",
        payload: { username: botUsername, reason },
      });
      process.exit(0); // Exit worker on disconnect
    });

    // Signal main thread that initialization is complete
    safePostMessage({
      type: "initialized",
      payload: { username: botUsername },
    });
  } catch (err) {
    console.error(`[Worker ${botUsername}] Failed to initialize:`, err);
    safePostMessage({
      type: "initializationError",
      payload: { username: botUsername, error: String(err) },
    });
    process.exit(1); // Exit if initialization fails
  }
}

// --- Message Handling from Main Thread ---
parentPort.on("message", async (message: any) => {
  if (!agentBotInstance) {
    console.warn(
      `[Worker ${botUsername}] Received message before initialization:`,
      message
    );
    return;
  }

  // console.log(`[Worker ${botUsername}] Received message type: ${message.type}`); // Debugging

  switch (message.type) {
    case "getState":
      try {
        const state = serializeSharedState(agentBotInstance.sharedState);
        safePostMessage({
          type: "stateUpdate",
          payload: { username: botUsername, state },
        });
      } catch (e) {
        console.error(`[Worker ${botUsername}] Error serializing state:`, e);
      }
      break;

    case "llmResponse": // Response from main thread LLM proxy
      console.log(
        `[Worker ${botUsername}] Received LLM response for request ${message.requestId}`
      );
      // Find the promise resolver stored earlier and resolve it
      const resolver = llmRequestPromises.get(message.requestId);
      if (resolver) {
        if (message.payload.error) {
          resolver.reject(new Error(message.payload.error));
        } else {
          resolver.resolve(message.payload.response);
        }
        llmRequestPromises.delete(message.requestId);
      } else {
        console.warn(
          `[Worker ${botUsername}] No promise found for LLM response ID ${message.requestId}`
        );
      }
      break;

    case "startGoalPlan":
      console.log(
        `[Worker ${botUsername}] Received startGoalPlan request:`,
        message.payload.goal
      );
      try {
        // buildGoalTree needs access to the worker's bot instance/state
        // Ensure buildGoalTree uses the worker's sharedState
        const tree: StepNode[] = await buildGoalTree(
          message.payload.goal,
          message.payload.mode,
          (updatedTree: StepNode[]) => {
            // Send progress back to the main thread
            safePostMessage({
              type: "goalPlanProgress",
              payload: { username: botUsername, tree: updatedTree },
            });
          },
          agentBotInstance.sharedState // Pass the worker's state
        );
        // Send final result back to the main thread
        safePostMessage({
          type: "goalPlanComplete",
          payload: { username: botUsername, tree },
        });
      } catch (err: any) {
        console.error(
          `[Worker ${botUsername}] Error during goal planning:`,
          err
        );
        safePostMessage({
          type: "goalPlanError",
          payload: {
            username: botUsername,
            error: err.message || "Unknown goal planning error",
          },
        });
      }
      break;

    // Add handlers for other commands if needed (e.g., runTestCommand)

    default:
      console.warn(
        `[Worker ${botUsername}] Received unknown message type: ${message.type}`
      );
  }
});

// --- LLM Proxy Logic ---
// Store promises waiting for LLM responses from the main thread
const llmRequestPromises = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason?: any) => void }
>();
let llmRequestIdCounter = 0;

// Function to be used by FunctionCaller instead of direct OpenAI call
export function proxyLLMRequest(
  type: "chat" | "json",
  payload: any
): Promise<any> {
  if (!parentPort) return Promise.reject(new Error("Worker is shutting down"));
  const requestId = `${botUsername}_${llmRequestIdCounter++}`;
  return new Promise((resolve, reject) => {
    llmRequestPromises.set(requestId, { resolve, reject });
    safePostMessage({
      type: "llmRequest",
      requestId: requestId,
      payload: { type, data: payload }, // Send type and original payload
    });
    // Optional: Add a timeout?
  });
}

// --- Start Initialization ---
initializeBot();
