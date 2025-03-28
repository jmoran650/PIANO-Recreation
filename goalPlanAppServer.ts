// goalPlanAppServer.ts
// ... other imports ...
import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import fs from "fs";
// Import AgentBot type if not already (might be implicitly available via main)
import { main } from "./index";
import { SharedAgentState } from "./src/sharedAgentState";
import { getLLMMetrics, toggleLLMEnabled } from "./utils/llmWrapper";
import { buildGoalTree, StepNode } from "./src/goalPlanner";
import {
  serializeSharedState
} from "./src/server/serverUtils"

async function startServer() {
  // Get both agent instances
  const agents = await main(); // Returns { agent: AgentBot, agent2: AgentBot }
  const agentBot = agents.agent;
  const daBiggestBird = agents.agent2;

  console.log(`main() returned. Monitoring: ${agentBot.bot.username} and ${daBiggestBird.bot.username}`);

  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server);

  app.use(express.static(path.join(__dirname, "../public")));

  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });

  app.get("/goal-planner", (req: Request, res: Response) => { // Ensure goal planner route works
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });


  app.post("/toggle-llm", (req: Request, res: Response) => {
    const newState = toggleLLMEnabled();
    const message = newState
      ? "LLM requests enabled."
      : "LLM requests disabled.";
    // Respond with JSON including the new state
    res.json({ message: message, enabled: newState });
  });

  let lastLogIndices: Record<string, number> = { // Track log index per bot
      [agentBot.bot.username]: 0,
      [daBiggestBird.bot.username]: 0,
  };
  const LOGFILE_PATH_PREFIX = path.join(__dirname, "../"); // Log files per bot

  io.on("connection", (socket) => {
    console.log("Browser connected via Socket.IO");

    const intervalId = setInterval(() => {
      try {
        // Serialize state for both bots
        const stateAgentBot = serializeSharedState(agentBot.sharedState);
        const stateDaBiggestBird = serializeSharedState(daBiggestBird.sharedState);
        // console.log(`[Server Emit] ${agentBot.bot.username} Pos:`, stateAgentBot.botPosition);
        // console.log(`[Server Emit] ${daBiggestBird.bot.username} Pos:`, stateDaBiggestBird.botPosition);

        // Prepare the combined state object
        const allStates = {
          [agentBot.bot.username]: stateAgentBot,
          [daBiggestBird.bot.username]: stateDaBiggestBird,
        };

        // Emit the combined state object under a new event name
        socket.emit("allSharedStates", allStates);

        // --- Log Handling (Example: Separate files per bot) ---
        for (const botInstance of [agentBot, daBiggestBird]) {
            const botUsername = botInstance.bot.username;
            const currentLog = botInstance.sharedState.conversationLog;
            const lastIndex = lastLogIndices[botUsername] ?? 0;
            const logFilePath = `${LOGFILE_PATH_PREFIX}${botUsername}_conversation.log`;

            if (currentLog.length > lastIndex) {
                const newEntries = currentLog.slice(lastIndex);
                // Append new entries to the bot-specific log file
                const linesToAppend = newEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
                fs.appendFileSync(logFilePath, linesToAppend, "utf8");
                lastLogIndices[botUsername] = currentLog.length; // Update index for this bot
            }
        }
        // --- End Log Handling ---

      } catch (error) {
        console.error("!!! Error inside server's setInterval:", error);
      }
    }, 1000); // Interval remains 1 second

    socket.on("disconnect", () => {
      clearInterval(intervalId);
      console.log("Browser disconnected");
    });

    // Goal Planning - Decide which bot's context to use.
    // Option 1: Always use AgentBot (simpler)
    // Option 2: Add bot selection to the event data (more complex)
    // Let's stick with Option 1 for now.
    socket.on(
      "startGoalPlan",
      async (data: { goal: string; mode?: "bfs" | "dfs" }) => {
        try {
          const goal = data.goal;
          const mode = data.mode || "bfs";
          console.log(`Starting goal planning for: "${goal}" (mode: ${mode}, context: ${agentBot.bot.username})`);
          const tree: StepNode[] = await buildGoalTree(
            goal,
            mode,
            (updatedTree: StepNode[]) => {
              socket.emit("goalPlanProgress", updatedTree);
            },
            agentBot.sharedState // Using primary AgentBot's state for context
          );
          socket.emit("goalPlanComplete", tree);
        } catch (err: any) {
            console.error("Error during goal planning socket event:", err);
            socket.emit("goalPlanError", err.message || "Unknown error during goal planning");
        }
      }
    );
  });

  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`Goal Planner: http://localhost:${PORT}/goal-planner`);
  });
}

startServer().catch((err) => {
  console.error("Error starting server:", err);
});