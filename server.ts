// server.ts
import express, { Request, Response } from "express"
import http from "http"
import path from "path"
import { Server as SocketIOServer } from "socket.io"

import { main } from "./index"
import { SharedAgentState } from "./src/sharedAgentState"

/**
 * Helper: Convert various Maps in SharedAgentState to plain objects.
 */
function serializeSharedState(sharedState: SharedAgentState) {
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
  }
}

function mapToObj(map: Map<string, string>) {
  const obj: Record<string, string> = {}
  for (const [k, v] of map.entries()) {
    obj[k] = v
  }
  return obj
}

function mapToObjVec3(map: Map<string, { x: number; y: number; z: number }>) {
  const obj: Record<string, { x: number; y: number; z: number }> = {}
  for (const [k, v] of map.entries()) {
    obj[k] = { x: v.x, y: v.y, z: v.z }
  }
  return obj
}

function mapToObjSentiment(map: Map<string, { sentiment: number; reasons: string[] }>) {
  const obj: Record<string, { sentiment: number; reasons: string[] }> = {}
  for (const [k, v] of map.entries()) {
    obj[k] = { sentiment: v.sentiment, reasons: v.reasons }
  }
  return obj
}

/**
 * Start everything:
 *   - Launch the bot
 *   - Launch an Express server
 *   - Serve the frontend
 *   - Use Socket.IO to push real-time updates of sharedState
 */
async function startServer() {
  // 1) Start the bot, get its full agent object
  const agent = await main() // from index.ts

  // 2) Create an Express + HTTP + Socket.IO combo
  const app = express()
  const server = http.createServer(app)
  const io = new SocketIOServer(server)

  // 3) Serve the static frontend from the "public" folder located one level up
  app.use(express.static(path.join(__dirname, "../public")))

  // 4) Explicit route for "/"
  app.get("/", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../public/index.html"))
  })

  // 5) Simple test endpoint with explicit types for req and res
  app.get("/ping", (req: Request, res: Response) => {
    res.send("pong")
  })

  // 6) On Socket.IO connections, send updates every 1s
  io.on("connection", (socket) => {
    console.log("Browser connected via Socket.IO")

    const intervalId = setInterval(() => {
      const stateObj = serializeSharedState(agent.sharedState)
      socket.emit("sharedState", stateObj)
    }, 1000)

    socket.on("disconnect", () => {
      clearInterval(intervalId)
      console.log("Browser disconnected")
    })
  })

  // 7) Start listening
  const PORT = 3000
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

// Actually start the server
startServer().catch((err) => {
  console.error("Error starting server:", err)
})