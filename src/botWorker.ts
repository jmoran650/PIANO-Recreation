// src/botWorker.ts
import { parentPort, workerData } from 'worker_threads';
import { createAgentBot, AgentBot, BotOptions } from '../createAgentBot'; // Adjust path if needed
import { StepNode, buildGoalTree } from './goalPlanner'; // Adjust path
import { serializeSharedState } from './server/serverUtils'; // Adjust path
import dotenv from "dotenv";

dotenv.config(); // Ensure worker loads environment variables

if (!parentPort) throw new Error('This script must be run as a worker thread.');

let agentBotInstance: AgentBot | null = null;
const botUsername: string = (workerData as BotOptions).username; // Get username early for logging

console.log(`[Worker ${botUsername}] Initializing...`);

// Function to safely post messages (handles potential null parentPort during shutdown)
function safePostMessage(message: any) {
    if (parentPort) {
        parentPort.postMessage(message);
    } else {
        console.warn(`[Worker ${botUsername}] parentPort is null, cannot send message:`, message);
    }
}

// --- Main Worker Logic ---
async function initializeBot() {
    try {
        const botOptions = workerData as BotOptions;
        agentBotInstance = await createAgentBot(botOptions);

        console.log(`[Worker ${botUsername}] Bot instance created and spawned.`);

        // Override log methods in SharedAgentState to post messages
        const originalLogMessage = agentBotInstance.sharedState.logMessage.bind(agentBotInstance.sharedState);
        agentBotInstance.sharedState.logMessage = (role, content, metadata, functionName, functionArgs, functionResult) => {
            originalLogMessage(role, content, metadata, functionName, functionArgs, functionResult); // Keep internal log
            const entry = agentBotInstance?.sharedState.conversationLog.slice(-1)[0]; // Get the entry just added
            if (entry) {
                 safePostMessage({ type: 'logEntry', payload: { username: botUsername, entry } });
            }
        };
         // Override specific OpenAI log methods to prevent direct logging if handled by main thread proxy
         agentBotInstance.sharedState.logOpenAIRequest = (endpoint, payload) => {
            // We rely on main thread logging this via the proxy
            // Optionally log minimal info here if needed for worker context
             originalLogMessage('api_request', `[Proxy Request] to ${endpoint}`, { store: payload.store });
        };
        agentBotInstance.sharedState.logOpenAIResponse = (endpoint, response) => {
             originalLogMessage('api_response', `[Proxy Response] from ${endpoint}`);
        };
        agentBotInstance.sharedState.logOpenAIError = (endpoint, error) => {
             originalLogMessage('api_error', `[Proxy Error] from ${endpoint}: ${String(error)}`);
        };


        // --- Set up Bot Event Listeners ---

        // Chat Listener (for commands and relaying)
        agentBotInstance.bot.on('chat', async (username: string, message: string) => {
            if (username === agentBotInstance?.bot.username) return;

            console.log(`[Worker ${botUsername}] Received chat: ${username}: ${message}`);

            let targetUsername: string | null = null;
            let commandMessage: string = message;
            let isForAll = false;
            let isPrefixed = false;

            if (message.toLowerCase().startsWith('ab:')) {
                targetUsername = 'AgentBot';
                commandMessage = message.substring(3).trim();
                isPrefixed = true;
            } else if (message.toLowerCase().startsWith('dbb:')) {
                targetUsername = 'DaBiggestBird';
                commandMessage = message.substring(4).trim();
                 isPrefixed = true;
            } else if (message.toLowerCase().startsWith('all:')) {
                isForAll = true;
                commandMessage = message.substring(4).trim();
                 isPrefixed = true;
            }

             // 1. Handle Internal Commands (if targeted or for all)
            if (isForAll || targetUsername === botUsername) {
                if (commandMessage.startsWith('test ')) {
                    const testCommand = commandMessage.substring(5).trim();
                     console.log(`[Worker ${botUsername}] Handling internal test command: ${testCommand}`);
                    // Import handleChatTestCommand dynamically or ensure it's available
                     try {
                        const { handleChatTestCommand } = await import('./chatTests'); // Adjust path
                        await handleChatTestCommand(agentBotInstance!, username, testCommand); // Pass the instance
                    } catch(e) {
                         console.error(`[Worker ${botUsername}] Error running test command: ${e}`);
                         safePostMessage({ type: 'sendChat', payload: { message: `Error running test command: ${e}` } });
                    }
                }
                 // Add other internal command handling here if needed
            }

            // 2. Relay message to main thread if it was prefixed (for others) or wasn't prefixed (for context/LLM)
             if (isPrefixed || !message.startsWith('test ')) { // Relay if prefixed OR if it's general chat
                 console.log(`[Worker ${botUsername}] Relaying chat to main thread.`);
                 safePostMessage({ type: 'relayChat', payload: { username, message } });
             }
        });

        agentBotInstance.bot.on('error', (err) => {
            console.error(`[Worker ${botUsername}] Bot Error:`, err);
            safePostMessage({ type: 'botError', payload: { username: botUsername, error: String(err) } });
        });

        agentBotInstance.bot.on('kicked', (reason) => {
            console.error(`[Worker ${botUsername}] Kicked:`, reason);
            safePostMessage({ type: 'botKicked', payload: { username: botUsername, reason } });
            process.exit(1); // Exit worker on kick
        });

        agentBotInstance.bot.on('end', (reason) => {
            console.log(`[Worker ${botUsername}] Disconnected:`, reason);
            safePostMessage({ type: 'botEnd', payload: { username: botUsername, reason } });
            process.exit(0); // Exit worker on disconnect
        });

        // Signal main thread that initialization is complete
        safePostMessage({ type: 'initialized', payload: { username: botUsername } });

    } catch (err) {
        console.error(`[Worker ${botUsername}] Failed to initialize:`, err);
        safePostMessage({ type: 'initializationError', payload: { username: botUsername, error: String(err) } });
        process.exit(1); // Exit if initialization fails
    }
}

// --- Message Handling from Main Thread ---
parentPort.on('message', async (message: any) => {
    if (!agentBotInstance) {
        console.warn(`[Worker ${botUsername}] Received message before initialization:`, message);
        return;
    }

    // console.log(`[Worker ${botUsername}] Received message type: ${message.type}`); // Debugging

    switch (message.type) {
        case 'getState':
            try {
                const state = serializeSharedState(agentBotInstance.sharedState);
                safePostMessage({ type: 'stateUpdate', payload: { username: botUsername, state } });
            } catch (e) {
                 console.error(`[Worker ${botUsername}] Error serializing state:`, e);
            }
            break;

        case 'incomingChat': // Chat relayed from main thread
            console.log(`[Worker ${botUsername}] Processing incoming chat relay: ${message.payload.username}: ${message.payload.message}`);
             // Add to conversation log, maybe trigger social module, etc.
            agentBotInstance.sharedState.logMessage("user", `${message.payload.username}: ${message.payload.message}`);
             // Potentially trigger LLM response via social module if appropriate
             // await agentBotInstance.social.listen(message.payload.message, message.payload.username);
            break;

        case 'llmResponse': // Response from main thread LLM proxy
             console.log(`[Worker ${botUsername}] Received LLM response for request ${message.requestId}`);
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
                 console.warn(`[Worker ${botUsername}] No promise found for LLM response ID ${message.requestId}`);
             }
            break;

         case 'startGoalPlan':
             console.log(`[Worker ${botUsername}] Received startGoalPlan request:`, message.payload.goal);
            try {
                 // buildGoalTree needs access to the worker's bot instance/state
                 // Ensure buildGoalTree uses the worker's sharedState
                 const tree: StepNode[] = await buildGoalTree(
                     message.payload.goal,
                     message.payload.mode,
                     (updatedTree: StepNode[]) => {
                         // Send progress back to the main thread
                         safePostMessage({ type: 'goalPlanProgress', payload: { username: botUsername, tree: updatedTree } });
                     },
                     agentBotInstance.sharedState // Pass the worker's state
                 );
                  // Send final result back to the main thread
                 safePostMessage({ type: 'goalPlanComplete', payload: { username: botUsername, tree } });
             } catch (err: any) {
                 console.error(`[Worker ${botUsername}] Error during goal planning:`, err);
                  safePostMessage({ type: 'goalPlanError', payload: { username: botUsername, error: err.message || "Unknown goal planning error" } });
             }
            break;

        // Add handlers for other commands if needed (e.g., runTestCommand)

        default:
            console.warn(`[Worker ${botUsername}] Received unknown message type: ${message.type}`);
    }
});

// --- LLM Proxy Logic ---
// Store promises waiting for LLM responses from the main thread
const llmRequestPromises = new Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void }>();
let llmRequestIdCounter = 0;

// Function to be used by FunctionCaller instead of direct OpenAI call
export function proxyLLMRequest(type: 'chat' | 'json', payload: any): Promise<any> {
     if (!parentPort) return Promise.reject(new Error("Worker is shutting down"));
    const requestId = `${botUsername}_${llmRequestIdCounter++}`;
    return new Promise((resolve, reject) => {
        llmRequestPromises.set(requestId, { resolve, reject });
        safePostMessage({
            type: 'llmRequest',
            requestId: requestId,
            payload: { type, data: payload } // Send type and original payload
        });
        // Optional: Add a timeout?
    });
}

// --- Start Initialization ---
initializeBot();