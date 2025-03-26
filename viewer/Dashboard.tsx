import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import { Link } from "react-router-dom";
import ChatLog from "./chatLog";
import { LogEntry } from "../types/log.types";
interface SharedState {
  visibleBlockTypes?: any;
  visibleMobs?: any;
  playersNearby?: any;
  shortTermMemoryIndex?: any;
  longTermMemoryIndex?: any;
  locationMemoryIndex?: any;
  longTermGoalQueue?: any;
  currentLongTermGoal?: any;
  currentShortTermGoal?: any;
  pendingActions?: any;
  lockedInTask?: any;
  feelingsToOthers?: any;
  othersFeelingsTowardsSelf?: any;
  conversationLog?: LogEntry[];
  llmMetrics?: any;
  inventory?: any;
  botHealth?: number;
  botHunger?: number;
  craftingTablePositions?: any;
  equippedItems?: any;
}

const socket = io();

const Dashboard: React.FC = () => {
  const [sharedState, setSharedState] = useState<SharedState>({});
  const [llmToggled, setLlmToggled] = useState<boolean>(true);

  useEffect(() => {
    socket.on("sharedState", (data: SharedState) => {
      setSharedState(data);
    });
    return () => {
      socket.off("sharedState");
    };
  }, []);

  const handleToggleLLM = async () => {
    try {
      const response = await fetch("/toggle-llm", { method: "POST" });
      const data = await response.json(); // Assuming server responds with JSON { enabled: boolean, message: string }
      alert(data.message);
      setLlmToggled(data.enabled);
    } catch (err) {
      console.error("Error toggling LLM:", err);
      alert("Error toggling LLM.");
    }
  };

  return (
    <div className="dashboard-container">
      <header>
        <h1>Minecraft Bot Dashboard</h1>
        <nav>
          {/* Use Link for client-side navigation */}
          <Link to="/goal-planner">Goal Planner</Link>
        </nav>
      </header>

      {/* Floating Chat Log Sidebar on the left */}
      <div id="chatLogSidebar">
        <ChatLog conversationLog={sharedState.conversationLog} />
      </div>

      <div className="container">
        {/* Apply masonry layout via CSS columns */}
        <div className="grid">
          {/* Environment Tile */}
          <div className="tile" id="environmentTile">
            <h2>Environment</h2>
            <div className="subtile">
              <h3>Visible Block Types</h3>
              <pre>
                {JSON.stringify(sharedState.visibleBlockTypes, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Visible Mobs</h3>
              <pre>
                {JSON.stringify(sharedState.visibleMobs, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Players Nearby</h3>
              <pre>
                {JSON.stringify(sharedState.playersNearby, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
          </div>
          {/* Memory Tile */}
          <div className="tile" id="memoryTile">
            <h2>Memory</h2>
            <div className="subtile">
              <h3>Short Term Memory</h3>
              <pre>
                {JSON.stringify(sharedState.shortTermMemoryIndex, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Long Term Memory</h3>
              <pre>
                {JSON.stringify(sharedState.longTermMemoryIndex, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Location Memory</h3>
              <pre>
                {JSON.stringify(sharedState.locationMemoryIndex, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
          </div>
          {/* Goals & Actions Tile */}
          <div className="tile" id="goalsTile">
            <h2>Goals &amp; Actions</h2>
            <div className="subtile">
              <h3>Long Term Goal Queue</h3>
              <pre>
                {JSON.stringify(sharedState.longTermGoalQueue, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Current Long Term Goal</h3>
              <pre>
                {JSON.stringify(sharedState.currentLongTermGoal, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Current Short Term Goal</h3>
              <pre>
                {JSON.stringify(sharedState.currentShortTermGoal, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Pending Actions</h3>
              <pre>
                {JSON.stringify(sharedState.pendingActions, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Locked In Task</h3>
              <pre>
                {JSON.stringify(sharedState.lockedInTask, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
          </div>
          {/* Social Tile */}
          <div className="tile" id="socialTile">
            <h2>Social</h2>
            <div className="subtile">
              <h3>Feelings To Others</h3>
              <pre>
                {JSON.stringify(sharedState.feelingsToOthers, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Others' Feelings Towards Self</h3>
              <pre>
                {JSON.stringify(
                  sharedState.othersFeelingsTowardsSelf,
                  null,
                  2
                ) || "Loading..."}
              </pre>
            </div>
          </div>
          {/* Bot Status Tile */}
          <div className="tile" id="statusTile">
            <h2>Bot Status</h2>
            <div className="subtile">
              <h3>Inventory Contents</h3>
              <pre>
                {JSON.stringify(sharedState.inventory, null, 2) || "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Health &amp; Hunger</h3>
              <pre>
                Health: {sharedState.botHealth ?? "N/A"} | Hunger:{" "}
                {sharedState.botHunger ?? "N/A"}
              </pre>
            </div>
            <div className="subtile">
              <h3>Equipped Items</h3>
              <pre>
                {JSON.stringify(sharedState.equippedItems, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
            <div className="subtile">
              <h3>Crafting Table Positions</h3>
              <pre>
                {JSON.stringify(sharedState.craftingTablePositions, null, 2) ||
                  "Loading..."}
              </pre>
            </div>
          </div>
          {/* Add more tiles here if needed */}
        </div>
      </div>
      {/* Fixed LLM Metrics Sidebar on the right */}
      <div id="llmSidebar">
        <h2>LLM Metrics</h2>
        <div className="sidebar-section">
          <h3>Total Requests</h3>
          <pre>
            {JSON.stringify(sharedState.llmMetrics?.totalRequests, null, 2) ||
              "Loading..."}
          </pre>
        </div>
        <div className="sidebar-section">
          <h3>Requests Last 10 Min</h3>
          <pre>
            {JSON.stringify(
              sharedState.llmMetrics?.requestsLast10Min,
              null,
              2
            ) || "Loading..."}
          </pre>
        </div>
        <div className="sidebar-section">
          <h3>Total Input Characters</h3>
          <pre>
            {JSON.stringify(sharedState.llmMetrics?.totalInputChars, null, 2) ||
              "Loading..."}
          </pre>
        </div>
        <div className="sidebar-section">
          <h3>Total Output Characters</h3>
          <pre>
            {JSON.stringify(
              sharedState.llmMetrics?.totalOutputChars,
              null,
              2
            ) || "Loading..."}
          </pre>
        </div>
        <button id="toggleButton" onClick={handleToggleLLM}>
          {llmToggled ? "Kill LLM" : "Resume LLM"}
        </button>
      </div>
      <footer>
        <p>&copy; 2025 Minecraft Bot Dashboard. All rights reserved.</p>
      </footer>
      {/* Updated Styles */}
      <style>{`
        .dashboard-container {
          font-family: "Poppins", sans-serif;
          background: #f8f9fa;
          color: #212529;
          min-height: 100vh;
          padding-bottom: 60px; /* For footer */
        }
        header {
          background: #3949ab;
          padding: 20px;
          text-align: center;
          color: #fff;
        }
        header h1 {
          margin: 0;
          font-size: 2.5rem;
        }
        nav {
          margin-top: 10px;
        }
        nav a {
          background-color: #7986cb;
          color: #fff;
          text-decoration: none;
          font-size: 1.2rem;
          margin: 0 10px;
          padding: 5px 10px;
          border-radius: 5px;
        }
        .container {
          max-width: 1200px;
          margin: 30px auto;
          padding: 20px;
          /* Add padding to prevent content from going under fixed sidebars if needed */
          /* Example: padding-left: 360px; padding-right: 290px; */
          /* Adjust based on sidebar widths and desired spacing */
        }

        /* --- Masonry Layout --- */
        .grid {
          /* Instead of CSS Grid, use multi-column layout for masonry effect */
          column-width: 300px; /* Minimum width for columns */
          column-gap: 20px;   /* Space between columns */
          width: 100%;        /* Ensure it takes full width of container */
        }

        .tile {
          background: #fff;
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          margin-bottom: 20px; /* Space below each tile */
          /* --- Prevent tiles from breaking across columns --- */
          break-inside: avoid;
          /* Ensure tile height is determined by content */
          height: auto;
        }
        /* --- End Masonry Layout --- */

        .tile:hover {
          transform: translateY(-5px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
        }
        .tile h2 {
          margin-top: 0;
          color: #3949ab;
        }
        .subtile {
          margin-bottom: 20px;
        }
        .subtile:last-child {
            margin-bottom: 0; /* Remove margin from last subtile */
        }
        .subtile h3 {
          font-size: 1.1rem;
          margin-bottom: 5px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 4px;
        }

        /* Style for preformatted text to wrap and expand vertically */
        pre {
          background: #e9ecef;
          padding: 10px;
          border-radius: 5px;
          overflow-x: auto; /* Allow horizontal scroll if absolutely needed */
          white-space: pre-wrap;   /* Allow text to wrap */
          word-wrap: break-word; /* Break long words */
          overflow-wrap: break-word; /* Ensure wrapping works */
          margin: 0; /* Remove default margin if any */
          /* Let the content dictate the height */
          min-height: 1.5em; /* Minimum height for empty pre */
          height: auto;
        }

        /* Resizable Chat Log Sidebar */
        #chatLogSidebar {
          position: fixed;
          top: 80px; /* Adjust based on header height */
          left: 20px;
          width: 300px;
          height: 400px;
          resize: both;
          overflow: auto;
          min-width: 250px;
          min-height: 200px;
          display: flex;
          flex-direction: column;
          background-color: #3949ab;
          color: #fff;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
          z-index: 1000;
        }
        /* Fixed LLM Metrics Sidebar on the right */
        #llmSidebar {
          position: fixed;
          top: 80px; /* Adjust based on header height */
          right: 20px;
          width: 250px;
          max-height: calc(100vh - 100px); /* Limit height and allow scrolling */
          overflow-y: auto;
          background-color: #3949ab;
          color: #fff;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
          z-index: 1000;
        }
        #llmSidebar h2 {
          margin-top: 0;
          font-size: 1.5rem;
          border-bottom: 2px solid rgba(255, 255, 255, 0.5);
          padding-bottom: 8px;
          margin-bottom: 15px;
        }
        .sidebar-section {
          margin-bottom: 15px;
        }
        .sidebar-section h3 {
          font-size: 1.1rem;
          margin-bottom: 5px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.5);
          padding-bottom: 4px;
        }
        .sidebar-section pre {
          background: rgba(255, 255, 255, 0.2);
          padding: 10px;
          border-radius: 5px;
          font-size: 0.9rem;
          line-height: 1.4;
          margin: 0;
          /* Ensure text wraps within sidebar */
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        #toggleButton {
          display: block; /* Ensure button takes full width */
          width: 100%;
          padding: 10px;
          margin-top: 15px;
          background-color: #ff6f61; /* Example color */
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1rem;
          transition: background-color 0.2s ease;
        }
        #toggleButton:hover {
            background-color: #e65a50; /* Darker shade on hover */
        }
        footer {
          text-align: center;
          margin-top: 40px; /* Adjust if content overlaps */
          padding: 20px 0;
          font-size: 0.9rem;
          color: #777;
          border-top: 1px solid #ddd;
          position: relative; /* Ensure footer is below floating elements in flow */
          clear: both; /* May help in some complex layouts */
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
