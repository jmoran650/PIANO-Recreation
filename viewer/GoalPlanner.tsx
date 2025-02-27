import React, { useState, useEffect } from "react";
import io from "socket.io-client";

// Create the socket connection; adjust URL if needed.
const socket = io();

interface PlanStep {
  step: string;
  funcCall: string | null;
  completionCriteria: string | null; // New field for completion criteria
}

const GoalPlanner: React.FC = () => {
  const [goal, setGoal] = useState<string>("");
  const [queue, setQueue] = useState<string[]>([]);
  const [finalPlan, setFinalPlan] = useState<PlanStep[]>([]);
  const [llmMetrics, setLLMMetrics] = useState<any>({});
  const [originalGoal, setOriginalGoal] = useState<string>("");

  useEffect(() => {
    socket.on("goalPlanProgress", (progress: { queue: string[]; finalPlan: PlanStep[] }) => {
      setQueue(progress.queue);
      setFinalPlan(progress.finalPlan);
    });

    socket.on("goalPlanComplete", (finalPlan: PlanStep[]) => {
      alert("Goal planning complete!");
      setFinalPlan(finalPlan);
      setQueue([]);
    });

    socket.on("goalPlanError", (errorMessage: string) => {
      alert("Error during goal planning: " + errorMessage);
    });

    socket.on("sharedState", (state: any) => {
      setLLMMetrics(state.llmMetrics);
    });

    return () => {
      socket.off("goalPlanProgress");
      socket.off("goalPlanComplete");
      socket.off("goalPlanError");
      socket.off("sharedState");
    };
  }, []);

  const handleStartPlanning = () => {
    if (!goal.trim()) {
      alert("Please enter a goal.");
      return;
    }
    setOriginalGoal(goal);
    setQueue([]);
    setFinalPlan([]);
    socket.emit("startGoalPlan", goal);
  };

  const renderGoalTree = () => {
    return (
      <ul className="tree-root">
        <li className="fade-in">
          Goal: <strong>{originalGoal}</strong>
          <ul>
            <li className="fade-in">
              Finalized Steps:
              <ul>
                {finalPlan.length === 0 ? (
                  <li className="fade-in">None yet</li>
                ) : (
                  finalPlan.map((stepObj, index) => (
                    <li key={index} className="fade-in">
                      <div>
                        {stepObj.step}
                        {stepObj.funcCall ? ` → ${stepObj.funcCall}` : ""}
                      </div>
                      <div style={{ fontSize: "0.8em", color: "#555" }}>
                        Completion: {stepObj.completionCriteria || "None"}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </li>
            <li className="fade-in">
              Pending Steps:
              <ul>
                {queue.length === 0 ? (
                  <li className="fade-in">None</li>
                ) : (
                  queue.map((pending, index) => (
                    <li key={index} className="fade-in">
                      {pending}
                    </li>
                  ))
                )}
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    );
  };

  return (
    <div className="container">
      <h1>Goal Planner</h1>
      <input
        id="goalInput"
        type="text"
        placeholder="Enter your goal here"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <button id="startButton" onClick={handleStartPlanning}>
        Start Planning
      </button>
      <div id="progress">
        <h2>Progress</h2>
        <div id="queueDisplay">
          <h3>Queue:</h3>
          <pre id="queueContent">{JSON.stringify(queue, null, 2)}</pre>
        </div>
        <div id="planDisplay">
          <h3>Final Plan:</h3>
          <pre id="planContent">{JSON.stringify(finalPlan, null, 2)}</pre>
        </div>
        <div id="goalTreeDisplay">
          <h3>Goal Breakdown Tree</h3>
          <div id="goalTree">{renderGoalTree()}</div>
        </div>
        <div id="llmMetricsDisplay">
          <h3>LLM Metrics</h3>
          <pre id="llmMetricsContent">{JSON.stringify(llmMetrics, null, 2)}</pre>
        </div>
      </div>
      <style>{`
        .container {
          margin: 0;
          padding: 20px;
          font-family: 'Poppins', sans-serif;
          background: #e0f7fa;
          color: #004d40;
          min-height: 100vh;
        }
        h1 {
          text-align: center;
          color: #00796b;
        }
        #goalInput {
          width: 100%;
          padding: 10px;
          font-size: 1rem;
          margin-bottom: 10px;
          border: 1px solid #00796b;
          border-radius: 5px;
        }
        #startButton {
          padding: 10px 20px;
          font-size: 1rem;
          background-color: #00796b;
          color: #fff;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          margin-bottom: 20px;
        }
        #startButton:hover {
          background-color: #00695c;
        }
        #progress {
          margin-top: 20px;
          background: #fff;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        pre {
          background: #e0f2f1;
          padding: 10px;
          border-radius: 5px;
          overflow-x: auto;
        }
        #goalTreeDisplay,
        #llmMetricsDisplay {
          margin-top: 20px;
        }
        #goalTree ul {
          list-style-type: none;
          padding-left: 20px;
          border-left: 2px solid #00796b;
        }
        #goalTree li {
          margin: 5px 0;
          position: relative;
        }
        .fade-in {
          opacity: 0;
          animation: fadeIn 1s forwards;
        }
        @keyframes fadeIn {
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default GoalPlanner;