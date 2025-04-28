// viewer/Dashboard.tsx
import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import { Link } from "react-router-dom";
import ChatLog from "./chatLog";
import { LogEntry } from "../types/log.types";
import { EquippedItems, VisibleBlockTypes, VisibleMobs } from "../types/sharedAgentState.types"; // Import necessary types

// Define the structure for a single bot's state
interface SingleBotState {
  visibleBlockTypes?: VisibleBlockTypes | null;
  visibleMobs?: VisibleMobs | null;
  playersNearby?: string[];
  shortTermMemoryIndex?: Record<string, string>;
  longTermMemoryIndex?: Record<string, string>;
  locationMemoryIndex?: Record<string, { x: number; y: number; z: number }>;
  longTermGoalQueue?: string[];
  currentLongTermGoal?: string | null;
  currentShortTermGoal?: string | null;
  pendingActions?: string[];
  lockedInTask?: boolean;
  feelingsToOthers?: Record<string, { sentiment: number; reasons: string[] }>;
  othersFeelingsTowardsSelf?: Record<string, { sentiment: number; reasons: string[] }>;
  conversationLog?: LogEntry[];
  llmMetrics?: any; // Assuming LLM metrics might still be somewhat global or per-bot
  inventory?: string[];
  botHealth?: number;
  botHunger?: number;
  craftingTablePositions?: { x: number; y: number; z: number }[]; // Assuming Vec3 serializes like this
  equippedItems?: EquippedItems;
  botPosition?: { x: number; y: number; z: number };
}

// Define the structure for holding states of all bots
type AllBotStates = Record<string, SingleBotState>;

const socket = io();

const Dashboard: React.FC = () => {
  const [allStates, setAllStates] = useState<AllBotStates>({});
  const [selectedBotUsername, setSelectedBotUsername] = useState<string | null>(null);
  const [llmToggled, setLlmToggled] = useState<boolean>(true); // Assuming global toggle initially

  useEffect(() => {
    // Listen for the new event containing states for all bots
    socket.on("allSharedStates", (data: AllBotStates) => {
      // console.log("Received allSharedStates:", data); // Debugging
      setAllStates(data);
      console.log("Received allSharedStates in Frontend:", data);
      // Set default selection if none is selected and data is available
      if (!selectedBotUsername && Object.keys(data).length > 0) {
        const firstBotUsername = Object.keys(data)[0];
        setSelectedBotUsername(firstBotUsername);
        console.log("Defaulting selected bot to:", firstBotUsername);
      }
    });

    // Optional: Fetch initial LLM state if needed, otherwise rely on first state emission
    // fetch('/api/llm-status').then(res => res.json()).then(data => setLlmToggled(data.enabled));

    return () => {
      socket.off("allSharedStates");
    };
  }, [selectedBotUsername]); // Re-run effect? Only needed if default setting logic depends on it changing elsewhere.

  const handleToggleLLM = async () => {
    try {
      // Endpoint remains the same, assumes global toggle
      const response = await fetch("/toggle-llm", { method: "POST" });
      const data = await response.json(); // Expect JSON response
      alert(data.message);
      setLlmToggled(data.enabled); // Update state based on response
    } catch (err) {
      console.error("Error toggling LLM:", err);
      alert("Error toggling LLM.");
    }
  };

  // Get the state object for the currently selected bot
  const selectedBotState: SingleBotState | undefined = selectedBotUsername
    ? allStates[selectedBotUsername]
    : undefined;

  const availableBots = Object.keys(allStates);

  // Helper to safely stringify, handling potential undefined state
  const safeStringify = (data: any) => {
      if (data === undefined || data === null) return "Loading...";
      try {
          return JSON.stringify(data, null, 2);
      } catch (err: unknown) {
          
          return "Error displaying data";
      }
  }

  return (
    <div className="dashboard-container">
      <header>
        <h1>Minecraft Bot Dashboard</h1>
         {/* --- Bot Selection Dropdown --- */}
         <div className="bot-selector">
           <label htmlFor="botSelect">Monitor Bot: </label>
           <select
             id="botSelect"
             value={selectedBotUsername ?? ""}
             onChange={(e) => setSelectedBotUsername(e.target.value)}
             disabled={availableBots.length === 0}
           >
             <option value="" disabled>-- Select Bot --</option>
             {availableBots.map(username => (
               <option key={username} value={username}>{username}</option>
             ))}
           </select>
         </div>
        <nav>
          <Link to="/">Dashboard</Link> | <Link to="/goal-planner">Goal Planner</Link>
        </nav>
      </header>

      {/* --- Chat Log Sidebar (Shows selected bot's log) --- */}
      <div id="chatLogSidebar">
        <ChatLog conversationLog={selectedBotState?.conversationLog} />
      </div>

      {/* --- Main Content Area --- */}
      <div className="container">
        {selectedBotState && selectedBotUsername ? (
          <div className="grid">
            {/* --- Tiles rendering data for selectedBotState --- */}

            {/* Environment Tile */}
            <div className="tile" id="environmentTile">
              <h2>Environment ({selectedBotUsername})</h2>
              <div className="subtile">
                <h3>Visible Block Types</h3>
                <pre>{safeStringify(selectedBotState.visibleBlockTypes)}</pre>
              </div>
              <div className="subtile">
                <h3>Visible Mobs</h3>
                <pre>{safeStringify(selectedBotState.visibleMobs)}</pre>
              </div>
              <div className="subtile">
                <h3>Players Nearby</h3>
                <pre>{safeStringify(selectedBotState.playersNearby)}</pre>
              </div>
            </div>

            {/* Memory Tile */}
            <div className="tile" id="memoryTile">
              <h2>Memory ({selectedBotUsername})</h2>
              <div className="subtile">
                <h3>Short Term Memory</h3>
                <pre>{safeStringify(selectedBotState.shortTermMemoryIndex)}</pre>
              </div>
              <div className="subtile">
                <h3>Long Term Memory</h3>
                <pre>{safeStringify(selectedBotState.longTermMemoryIndex)}</pre>
              </div>
              <div className="subtile">
                <h3>Location Memory</h3>
                <pre>{safeStringify(selectedBotState.locationMemoryIndex)}</pre>
              </div>
            </div>

            {/* Goals Tile */}
            <div className="tile" id="goalsTile">
              <h2>Goals & Actions ({selectedBotUsername})</h2>
              <div className="subtile">
                <h3>Long Term Goal Queue</h3>
                <pre>{safeStringify(selectedBotState.longTermGoalQueue)}</pre>
              </div>
              <div className="subtile">
                <h3>Current Long Term Goal</h3>
                <pre>{safeStringify(selectedBotState.currentLongTermGoal)}</pre>
              </div>
              <div className="subtile">
                <h3>Current Short Term Goal</h3>
                <pre>{safeStringify(selectedBotState.currentShortTermGoal)}</pre>
              </div>
              <div className="subtile">
                <h3>Pending Actions</h3>
                <pre>{safeStringify(selectedBotState.pendingActions)}</pre>
              </div>
              <div className="subtile">
                <h3>Locked In Task</h3>
                <pre>{safeStringify(selectedBotState.lockedInTask)}</pre>
              </div>
            </div>

            {/* Social Tile */}
            <div className="tile" id="socialTile">
              <h2>Social ({selectedBotUsername})</h2>
              <div className="subtile">
                <h3>Feelings To Others</h3>
                <pre>{safeStringify(selectedBotState.feelingsToOthers)}</pre>
              </div>
              <div className="subtile">
                <h3>Others' Feelings Towards Self</h3>
                <pre>{safeStringify(selectedBotState.othersFeelingsTowardsSelf)}</pre>
              </div>
            </div>

            {/* Status Tile */}
            <div className="tile" id="statusTile">
              <h2>Bot Status ({selectedBotUsername})</h2>
               <div className="subtile">
                 <h3>Position</h3>
                 <pre>{safeStringify(selectedBotState.botPosition)}</pre>
               </div>
              <div className="subtile">
                <h3>Inventory Contents</h3>
                <pre>{safeStringify(selectedBotState.inventory)}</pre>
              </div>
              <div className="subtile">
                <h3>Health & Hunger</h3>
                <pre>
                  Health: {selectedBotState.botHealth ?? "N/A"} | Hunger:{" "}
                  {selectedBotState.botHunger ?? "N/A"}
                </pre>
              </div>
              <div className="subtile">
                <h3>Equipped Items</h3>
                <pre>{safeStringify(selectedBotState.equippedItems)}</pre>
              </div>
              <div className="subtile">
                <h3>Crafting Table Positions</h3>
                <pre>{safeStringify(selectedBotState.craftingTablePositions)}</pre>
              </div>
            </div>
            {/* --- End Tiles --- */}
          </div>
        ) : (
          <div className="loading-message">
            <p>{availableBots.length > 0 ? "Select a bot to view its state." : "Waiting for bot data..."}</p>
          </div>
        )}
      </div>

      {/* --- LLM Metrics Sidebar (Assuming global/primary bot metrics) --- */}
      <div id="llmSidebar">
        <h2>LLM Metrics</h2>
         {/* Display LLM metrics - decide if global or per-bot. Showing selected bot's for now. */}
        <div className="sidebar-section">
            <h3>LLM Metrics Data</h3>
            <pre>{safeStringify(selectedBotState?.llmMetrics)}</pre>
        </div>
        {/* Add specific metric sections if llmMetrics object structure is known */}
        <button id="toggleButton" onClick={handleToggleLLM}>
          {llmToggled ? "Disable LLM" : "Enable LLM"}
        </button>
      </div>

      <footer>
        <p>&copy; {new Date().getFullYear()} Minecraft Bot Dashboard. All rights reserved.</p>
      </footer>

      {/* --- Styles --- */}
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
        /* Style for the bot selector dropdown */
        .bot-selector {
          margin-top: 10px; /* Space below title */
          margin-bottom: 10px; /* Space above nav links */
          text-align: center;
        }
        .bot-selector label {
          color: #E0E0E0; /* Lighter text for label */
          margin-right: 8px;
          font-size: 1rem;
          font-weight: 500;
        }
        .bot-selector select {
          padding: 6px 10px;
          border-radius: 4px;
          border: 1px solid #BDBDBD;
          background-color: #fff;
          font-size: 0.95rem;
          min-width: 160px; /* Ensure decent width */
          cursor: pointer;
        }
        .bot-selector select:disabled {
            cursor: not-allowed;
            background-color: #f0f0f0;
        }
        /* Ensure nav links look okay */
        nav {
          margin-top: 10px; /* Adjust if needed */
        }
        nav a {
          color: #fff;
          text-decoration: none;
          margin: 0 10px;
          padding: 5px 10px;
          border-radius: 4px;
          background-color: rgba(255, 255, 255, 0.1); /* Subtle background */
          transition: background-color 0.2s ease;
        }
        nav a:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }
        .container {
          max-width: 1200px;
          margin: 30px auto;
          padding: 20px;
          /* Add padding to prevent content from going under fixed sidebars if needed */
          /* Example: padding-left: 360px; padding-right: 290px; */
          /* Adjust based on sidebar widths and desired spacing */
          margin-left: 340px; /* Space for left sidebar */
          margin-right: 290px; /* Space for right sidebar */
        }
        /* Style for loading message */
        .loading-message {
            text-align: center;
            margin-top: 50px;
            font-size: 1.2rem;
            color: #666;
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
          overflow: hidden; /* Prevent content like long pre tags from overflowing the tile */
        }
        /* --- End Masonry Layout --- */
        .tile:hover {
          transform: translateY(-5px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
        }
        .tile h2 {
          margin-top: 0;
          color: #3949ab;
          font-size: 1.4rem; /* Slightly smaller tile titles */
          border-bottom: 1px solid #eee;
          padding-bottom: 8px;
          margin-bottom: 15px;
        }
        .subtile {
          margin-bottom: 15px; /* Consistent spacing */
        }
        .subtile:last-child {
            margin-bottom: 0; /* Remove margin from last subtile */
        }
        .subtile h3 {
          font-size: 1.05rem; /* Slightly smaller subtile titles */
          margin-bottom: 8px;
          color: #555;
          /* border-bottom: 1px solid #ccc; */ /* Optional: remove border */
          /* padding-bottom: 4px; */
        }
        /* Style for preformatted text to wrap and expand vertically */
        pre {
          background: #e9ecef;
          padding: 10px;
          border-radius: 5px;
          overflow: auto; /* Use auto scrolling */
          white-space: pre-wrap;   /* Allow text to wrap */
          word-wrap: break-word; /* Break long words */
          overflow-wrap: break-word; /* Ensure wrapping works */
          margin: 0; /* Remove default margin if any */
          /* Let the content dictate the height */
          min-height: 1.5em; /* Minimum height for empty pre */
          max-height: 250px; /* Limit max height for long content */
          height: auto;
          font-size: 0.85rem; /* Smaller font size for pre */
          line-height: 1.4; /* Improve readability */
        }
        /* Resizable Chat Log Sidebar */
        #chatLogSidebar {
          position: fixed;
          top: 120px; /* Adjust based on header height */
          left: 20px;
          width: 300px; /* Initial width */
          height: calc(100vh - 140px - 60px); /* Adjust height based on top offset and footer */
          max-height: 70vh; /* Max height relative to viewport */
          min-width: 250px;
          min-height: 200px;
          resize: both; /* Allow resizing */
          overflow: auto; /* Scrollbars appear when needed */
          display: flex;
          flex-direction: column;
          background-color: #ffffff; /* White background */
          color: #333; /* Dark text */
          padding: 15px; /* Slightly reduced padding */
          border-radius: 8px; /* Slightly smaller radius */
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* Softer shadow */
          z-index: 1000;
          border: 1px solid #ddd; /* Subtle border */
        }
         /* Style child ChatLog component container */
        #chatLogSidebar > div { /* Target the direct child div (ChatLog container) */
            flex-grow: 1; /* Allow ChatLog to fill space */
            display: flex;
            flex-direction: column;
            overflow: hidden; /* Prevent ChatLog internal overflow issues */
        }
         /* Style ChatLog's internal content area */
         #chatLogSidebar .chat-log-content {
             flex-grow: 1;
             max-height: none; /* Override ChatLog's internal max-height */
             height: 100%; /* Fill the available space */
         }
        /* Fixed LLM Metrics Sidebar on the right */
        #llmSidebar {
          position: fixed;
          top: 120px; /* Adjust based on header height */
          right: 20px;
          width: 250px;
          max-height: calc(100vh - 140px - 60px); /* Limit height and allow scrolling */
          overflow-y: auto;
          background-color: #e8eaf6; /* Lighter blue-grey background */
          color: #333;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          border: 1px solid #c5cae9; /* Subtle border matching background */
        }
        #llmSidebar h2 {
          margin-top: 0;
          font-size: 1.4rem;
          color: #3949ab; /* Match header color */
          border-bottom: 1px solid #9fa8da; /* Lighter border */
          padding-bottom: 8px;
          margin-bottom: 15px;
        }
        .sidebar-section {
          margin-bottom: 15px;
        }
        .sidebar-section h3 {
          font-size: 1rem;
          color: #3f51b5; /* Slightly darker blue */
          margin-bottom: 5px;
          border-bottom: 1px solid #c5cae9;
          padding-bottom: 4px;
        }
        .sidebar-section pre {
          background: #fff; /* White background for pre */
          padding: 8px;
          border-radius: 4px;
          font-size: 0.8rem; /* Smaller font */
          line-height: 1.3;
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
          border: 1px solid #e0e0e0; /* Light border for pre */
          max-height: 150px; /* Limit height of individual metric pre */
          overflow: auto; /* Scroll if needed */
        }
        #toggleButton {
          display: block; /* Ensure button takes full width */
          width: 100%;
          padding: 10px 15px;
          margin-top: 15px;
          background-color: #5c6bc0; /* Indigo button */
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
          text-align: center;
          transition: background-color 0.2s ease;
        }
        #toggleButton:hover {
            background-color: #3f51b5; /* Darker indigo on hover */
        }
         /* Style for disabled LLM button */
        #toggleButton:disabled {
             background-color: #9e9e9e;
             cursor: not-allowed;
        }
         /* Change button text/color based on state */
         #toggleButton.enabled {
             background-color: #ef5350; /* Red when enabled (for disabling) */
         }
         #toggleButton.enabled:hover {
             background-color: #e53935; /* Darker red on hover */
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
          background-color: #f1f1f1; /* Light background for footer */
        }

        /* Responsive adjustments (Example) */
        @media (max-width: 1000px) {
          .container {
            margin-left: 20px; /* Reduce margins */
            margin-right: 20px;
            max-width: none; /* Allow full width */
          }
          #chatLogSidebar, #llmSidebar {
             position: relative; /* Stack sidebars */
             width: 95%;
             margin: 10px auto;
             height: auto; /* Adjust height */
             max-height: 400px; /* Limit height when stacked */
             top: auto; left: auto; right: auto; /* Reset fixed positioning */
             resize: vertical; /* Allow vertical resize */
          }
          .grid {
            column-width: 250px; /* Adjust column width for smaller screens */
          }
        }
        @media (max-width: 600px) {
          .grid {
            column-width: 100%; /* Single column */
          }
           header h1 {
             font-size: 1.8rem;
           }
           .bot-selector select {
             min-width: 120px;
           }
           nav a {
             margin: 0 5px;
             font-size: 0.9rem;
           }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;