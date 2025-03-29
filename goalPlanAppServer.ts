// goalPlanAppServer.ts
import dotenv from "dotenv";
dotenv.config();
import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import fs from "fs";
// Remove direct main import from index if logic moved here
// import { main } from "./index"; // No longer needed if main logic is here
import { SharedAgentState } from "./src/sharedAgentState"; // Keep for type if needed? Maybe not.
import { getLLMMetrics, toggleLLMEnabled, setLLMLogger, callLLM, callLLMJsonSchema } from "./utils/llmWrapper"; // Import LLM utils for main thread use
import { StepNode } from "./src/goalPlanner"; // Keep for type
import { Worker } from "worker_threads";
import { BotOptions } from "./createAgentBot"; // Import BotOptions type


import OpenAI from "openai"; // Import OpenAI for main thread proxy calls


const LOGFILE_PATH_PREFIX = path.join(__dirname, "../"); // Log path prefix

// Ensure log directory exists (optional)
// if (!fs.existsSync(LOGFILE_PATH_PREFIX)) {
//     fs.mkdirSync(LOGFILE_PATH_PREFIX);
// }

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

if(process.env.MC_HOST == undefined){
  throw new Error("MC_HOST not loaded")
}

if(process.env.MC_PORT == undefined){
  throw new Error("MC_PORT not loaded")
}

// --- Centralized State and Worker Management ---
const workers = new Map<string, Worker>(); // Map username -> Worker
const botStates = new Map<string, any>(); // Map username -> latest serialized state
const botLogs = new Map<string, any[]>(); // Map username -> conversation log entries
const botOptionsList: BotOptions[] = [
    {
        host: process.env.MC_HOST, // Use env var or default
        port: parseInt(process.env.MC_PORT, 10),
        username: "AgentBot",
        version: process.env.MINECRAFT_VERSION,
    },
    {
        host: process.env.MC_HOST,
        port: parseInt(process.env.MC_PORT, 10),
        username: "DaBiggestBird",
        version: process.env.MINECRAFT_VERSION,
    },
];
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // OpenAI instance for main thread proxy

// Setup LLM Logger (using console for simplicity, adapt as needed)
setLLMLogger((type, message, meta) => {
    console.log(`[LLMLog-${type}] ${message}`, meta ? JSON.stringify(meta) : '');
    // Could also emit this via socket.io if needed
});

// --- Worker Initialization ---
function initializeWorkers() {
    console.log("Initializing workers...");
    botOptionsList.forEach(options => {
        if (!options.username) {
            console.error("Bot username is missing in options:", options);
            return;
        }
        const workerUsername = options.username;
        console.log(`Creating worker for ${workerUsername}...`);

        const worker = new Worker(path.resolve(__dirname, "src/botWorker.js"), { // Use .js extension (output of tsc)
            workerData: options // Pass options to worker
        });

        workers.set(workerUsername, worker);
        botStates.set(workerUsername, {}); // Initialize empty state
        botLogs.set(workerUsername, []); // Initialize empty log

        // --- Worker Message Handling ---
        worker.on('message', (message: any) => {
            // console.log(`[Main] Message from ${workerUsername}: Type=${message.type}`); // Debugging

            switch (message.type) {
                case 'initialized':
                    console.log(`[Main] Worker ${message.payload.username} initialized successfully.`);
                    // Request initial state?
                    worker.postMessage({ type: 'getState' });
                    break;
                case 'stateUpdate':
                    // console.log(`[Main] Received state update from ${message.payload.username}`);
                    botStates.set(message.payload.username, message.payload.state);
                    // Update conversation log from state if needed (or use separate log messages)
                    if(message.payload.state?.conversationLog) {
                         botLogs.set(message.payload.username, message.payload.state.conversationLog);
                    }
                    break;
                case 'logEntry':
                    // Append to centralized log and save incrementally
                     const logUsername = message.payload.username;
                     const entry = message.payload.entry;
                    // console.log(`[Main] Received log entry from ${logUsername}`);
                    const currentLogs = botLogs.get(logUsername) || [];
                    currentLogs.push(entry);
                    botLogs.set(logUsername, currentLogs); // Update in-memory log
                    // Append to file
                     try {
                         const logFilePath = `${LOGFILE_PATH_PREFIX}${logUsername}_conversation.log`;
                         fs.appendFileSync(logFilePath, JSON.stringify(entry) + '\n', "utf8");
                     } catch (e) {
                          console.error(`[Main] Error writing log for ${logUsername}:`, e);
                     }
                    break;

                case 'relayChat':
                    // Relay chat message to other workers/clients as needed
                    console.log(`[Main] Relaying chat from ${message.payload.username}: ${message.payload.message}`);
                    const sender = message.payload.username;
                    const originalMessage = message.payload.message;
                    workers.forEach((targetWorker, targetUsername) => {
                        if (targetUsername !== sender) { // Don't send back to sender
                           // Basic relay logic, could be enhanced with prefixes
                            console.log(`[Main] Forwarding chat to ${targetUsername}`);
                            targetWorker.postMessage({ type: 'incomingChat', payload: message.payload });
                        }
                    });
                    // Also potentially emit to web clients?
                    // io.emit('chatMessage', message.payload);
                    break;

                 case 'sendChat': // A worker requests the main thread send chat AS ITSELF
                     // This requires a bot instance on main thread, or worker handles it directly
                     // Assuming worker handles bot.chat() directly now. If not, handle here.
                      console.warn(`[Main] Received 'sendChat' request from worker ${workerUsername}. Workers should handle bot.chat() directly.`);
                     break;

                 case 'llmRequest':
                     // Handle LLM request proxied from worker
                     console.log(`[Main] Handling LLM Request ${message.requestId} from ${message.payload.botUsername}`);
                     handleProxiedLLMRequest(worker, message.requestId, message.payload);
                    break;

                 case 'goalPlanProgress':
                 case 'goalPlanComplete':
                 case 'goalPlanError':
                      // Forward goal planning updates to the specific socket client who initiated
                      // This requires tracking which socket initiated which plan
                      console.log(`[Main] Forwarding goal plan update type ${message.type} from ${message.payload.username}`);
                      // Need a way to map worker back to initiating socket - simplified for now: broadcast
                      io.emit(message.type, message.payload.tree || message.payload.error); // Emit tree or error
                     break;

                 case 'botError':
                 case 'botKicked':
                 case 'botEnd':
                 case 'initializationError':
                     console.error(`[Main] Critical event from worker ${message.payload.username}: ${message.type}`, message.payload);
                     // Handle cleanup, maybe notify client, attempt restart?
                     // For now, just log it. Consider removing worker from map on 'botEnd' or error.
                     // workers.delete(message.payload.username);
                     break;

                default:
                    console.warn(`[Main] Received unknown message type from ${workerUsername}: ${message.type}`);
            }
        });

        // --- Worker Error/Exit Handling ---
        worker.on('error', (err) => {
            console.error(`[Main] Worker ${workerUsername} error:`, err);
            workers.delete(workerUsername); // Remove from active workers
            // Notify client? Attempt restart?
        });

        worker.on('exit', (code) => {
            console.log(`[Main] Worker ${workerUsername} exited with code ${code}`);
            workers.delete(workerUsername); // Remove from active workers
            if (code !== 0) {
                console.error(`[Main] Worker ${workerUsername} exited abnormally!`);
                // Attempt restart?
            }
        });
    });
}

// --- LLM Proxy Handler ---
async function handleProxiedLLMRequest(worker: Worker, requestId: string, payload: any) {
    const { type, data } = payload;
    let responsePayload: any;
    try {
         // Log the request received by main thread proxy
          console.log(`[Main LLM Proxy] Request ${requestId} - Type: ${type}`);
         // Optionally log full payload if needed: console.log(JSON.stringify(data));

        if (type === 'chat') {
            // Assuming data = { model?, messages, tools?, tool_choice?, parallel_tool_calls? }
            // Call the actual OpenAI API using the main thread's instance/wrapper
             const completion = await openai.chat.completions.create({
                model: data.model || "gpt-4o", // Use provided or default
                messages: data.messages,
                tools: data.tools,
                tool_choice: data.tool_choice,
                parallel_tool_calls: data.parallel_tool_calls,
             });
              responsePayload = { response: completion }; // Send back the full completion object structure
              console.log(`[Main LLM Proxy] Response ${requestId} - Success (Chat)`);

        } else if (type === 'json') {
             // Assuming data = { model?, systemMsg, userMsg, jsonSchema }
             // Use callLLMJsonSchema directly in main thread
              const result = await callLLMJsonSchema(data.systemMsg, data.userMsg, data.jsonSchema);
              responsePayload = { response: result.parsed }; // Send back only the parsed object
              console.log(`[Main LLM Proxy] Response ${requestId} - Success (JSON)`);
        }
        // Add 'tools' type if FunctionCaller uses a different proxy path
        else {
            throw new Error(`Unsupported LLM proxy type: ${type}`);
        }

    } catch (error: any) {
         console.error(`[Main LLM Proxy] Error processing request ${requestId}:`, error);
        responsePayload = { error: error.message || String(error) };
    }

    // Send response back to the worker
    worker.postMessage({ type: 'llmResponse', requestId, payload: responsePayload });
}


// --- Express & Socket.IO Setup ---
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/goal-planner", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.post("/toggle-llm", (req: Request, res: Response) => {
    const newState = toggleLLMEnabled();
    const message = newState ? "LLM requests enabled." : "LLM requests disabled.";
    res.json({ message: message, enabled: newState });
});

io.on("connection", (socket) => {
    console.log("Browser connected via Socket.IO:", socket.id);

    // Send initial state immediately if available
    if (botStates.size > 0) {
         const allCurrentStates: { [key: string]: any } = {};
         botStates.forEach((state, username) => {
             allCurrentStates[username] = { ...state, conversationLog: botLogs.get(username) || [] }; // Combine state + log
         });
        socket.emit("allSharedStates", allCurrentStates);
    }

    // Setup interval for sending state updates to this specific client
    const intervalId = setInterval(() => {
        try {
             const allCurrentStates: { [key: string]: any } = {};
             // Construct state object for emission, combining latest state and logs
             workers.forEach((_, username) => {
                const state = botStates.get(username) || {};
                const logs = botLogs.get(username) || [];
                allCurrentStates[username] = { ...state, conversationLog: logs }; // Send combined data
                 // Add LLM metrics (assuming they are global in main thread)
                 allCurrentStates[username].llmMetrics = getLLMMetrics();
             });
            socket.emit("allSharedStates", allCurrentStates);
        } catch (error) {
            console.error("[Main] Error in server state update interval:", error);
        }
    }, 1000); // Update interval

    socket.on("disconnect", () => {
        clearInterval(intervalId);
        console.log("Browser disconnected:", socket.id);
    });

     // Handle goal planning requests from this client
     socket.on("startGoalPlan", async (data: { goal: string; mode?: "bfs" | "dfs" }) => {
        try {
             const goal = data.goal;
             const mode = data.mode || "bfs"; // Default to bfs
             // Determine which bot should handle (e.g., AgentBot)
             const targetWorker = workers.get("AgentBot"); // Example: hardcode AgentBot
             if (!targetWorker) {
                 throw new Error("Target bot worker (AgentBot) not found.");
             }
             console.log(`[Main] Relaying startGoalPlan to AgentBot worker for goal: "${goal}"`);
              // TODO: Store association between socket.id and this goal request
              // so progress can be sent back specifically to this client.
             targetWorker.postMessage({ type: 'startGoalPlan', payload: { goal, mode } });
         } catch (err: any) {
             console.error("[Main] Error starting goal plan:", err);
             socket.emit("goalPlanError", err.message || "Unknown error starting goal plan");
         }
     });

});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`Goal Planner: http://localhost:${PORT}/goal-planner`);
    // Initialize workers after server starts listening
    initializeWorkers();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log("SIGINT received. Shutting down workers...");
    workers.forEach(worker => worker.terminate());
    server.close(() => {
        console.log("Server closed.");
        process.exit(0);
    });
     // Force exit after timeout if server doesn't close
     setTimeout(() => {
         console.error("Forcing exit after timeout.");
         process.exit(1);
     }, 5000);
});