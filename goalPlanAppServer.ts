// goalPlanAppServer.ts
import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import fs from "fs"; // For writing conversation logs to file

import { main } from "./index";
import { SharedAgentState } from "./src/sharedAgentState";
import { getLLMMetrics, toggleLLMEnabled } from "./utils/llmWrapper";
import { buildGoalTree, StepNode } from "./src/goalPlanner";

// Helper functions to serialize data
function mapToObj(map: Map<string, string>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

function mapToObjVec3(
  map: Map<string, { x: number; y: number; z: number }>
): Record<string, { x: number; y: number; z: number }> {
  const obj: Record<string, { x: number; y: number; z: number }> = {};
  for (const [key, value] of map.entries()) {
    obj[key] = { x: value.x, y: value.y, z: value.z };
  }
  return obj;
}

function mapToObjSentiment(
  map: Map<string, { sentiment: number; reasons: string[] }>
): Record<string, { sentiment: number; reasons: string[] }> {
  const obj: Record<string, { sentiment: number; reasons: string[] }> = {};
  for (const [key, value] of map.entries()) {
    obj[key] = { sentiment: value.sentiment, reasons: value.reasons };
  }
  return obj;
}

function serializeSharedState(sharedState: any): any {
  return {
    visibleBlockTypes: sharedState.visibleBlockTypes,
    visibleMobs: sharedState.visibleMobs,
    playersNearby: sharedState.playersNearby,
    shortTermMemoryIndex: mapToObj(sharedState.shortTermMemoryIndex),
    longTermMemoryIndex: mapToObj(sharedState.longTermMemoryIndex),
    locationMemoryIndex: mapToObjVec3(sharedState.locationMemoryIndex),
    longTermGoalQueue: sharedState.longTermGoalQueue,
    currentLongTermGoal: sharedState.currentLongTermGoal,
    currentShortTermGoal: sharedState.currentShortTermGoal,
    pendingActions: sharedState.pendingActions,
    lockedInTask: sharedState.lockedInTask,
    feelingsToOthers: mapToObjSentiment(sharedState.feelingsToOthers),
    othersFeelingsTowardsSelf: mapToObjSentiment(sharedState.othersFeelingsTowardsSelf),
    conversationLog: sharedState.conversationLog,
    llmMetrics: getLLMMetrics(),
    inventory: sharedState.inventory,
    botHealth: sharedState.botHealth,
    botHunger: sharedState.botHunger,
    craftingTablePositions: sharedState.craftingTablePositions,
    equippedItems: sharedState.equippedItems,
  };
}

async function startServer() {
  const agent = await main();

  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server);

  app.use(express.static(path.join(__dirname, "../public")));

  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });

  app.get("/ping", (req: Request, res: Response) => {
    res.send("pong");
  });

  app.post("/toggle-llm", (req: Request, res: Response) => {
    const newState = toggleLLMEnabled();
    const message = newState ? "LLM requests enabled." : "LLM requests disabled.";
    res.send(message);
  });

  // For storing conversation logs to a file, we keep track of the last index we've written
  let lastLogIndex = 0;
  const LOGFILE_PATH = path.join(__dirname, "../conversation.log");

  io.on("connection", (socket) => {
    console.log("Browser connected via Socket.IO");

    // 1) Send the shared state to the browser every second
    const intervalId = setInterval(() => {
      const stateObj = serializeSharedState(agent.sharedState);
      socket.emit("sharedState", stateObj);

      // Also flush any new conversation log entries to disk
      const fullLog = agent.sharedState.conversationLog;
      if (fullLog.length > lastLogIndex) {
        // Append new lines
        const newLines = fullLog.slice(lastLogIndex).join("\n") + "\n";
        fs.appendFileSync(LOGFILE_PATH, newLines, "utf8");
        lastLogIndex = fullLog.length;

        // Optional: rotate if file grows large, etc. (stub)
        // if (fs.statSync(LOGFILE_PATH).size > 10_000_000) {
        //   // do simple rotation
        // }
      }
    }, 1000);

    socket.on("disconnect", () => {
      clearInterval(intervalId);
      console.log("Browser disconnected");
    });

    // 2) Listen for hierarchical goal planning requests
    socket.on("startGoalPlan", async (data: { goal: string; mode?: "bfs" | "dfs" }) => {
      try {
        const goal = data.goal;
        const mode = data.mode || "bfs";
        console.log(`Starting goal planning for: "${goal}" (mode: ${mode})`);

        // Build the goal tree (flat array) while sending incremental updates
        const tree: StepNode[] = await buildGoalTree(
          goal,
          mode,
          (updatedTree: StepNode[]) => {
            socket.emit("goalPlanProgress", updatedTree);
          },
          agent.sharedState
        );
        // Once done, emit the final tree
        socket.emit("goalPlanComplete", tree);
      } catch (err: any) {
        socket.emit("goalPlanError", err.message);
      }
    });
  });

  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Error starting server:", err);
});