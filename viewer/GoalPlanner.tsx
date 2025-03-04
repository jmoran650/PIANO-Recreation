import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import * as d3 from "d3";
import { HierarchyPointLink, HierarchyPointNode } from "d3-hierarchy";

/**
 * The shape received from the backend. We now have an optional debugPrompt for each node.
 */
export interface StepNode {
  id: string;
  step: string;
  funcCall: string | null;
  completionCriteria: string | null;
  parentId: string | null;
  projectedInventory?: Record<string, number>;
  debugPrompt?: string;
}

interface TreeNode extends StepNode {
  substeps: TreeNode[];
}

/** 
 * Utility to build a hierarchical structure from the flat StepNode array 
 */
function buildHierarchy(flatNodes: StepNode[]): TreeNode | null {
  if (!flatNodes || flatNodes.length === 0) return null;
  const nodeMap: Record<string, TreeNode> = {};
  flatNodes.forEach((n) => {
    nodeMap[n.id] = { ...n, substeps: [] };
  });

  let root: TreeNode | null = null;
  flatNodes.forEach((n) => {
    if (n.parentId) {
      const parent = nodeMap[n.parentId];
      if (parent) {
        parent.substeps.push(nodeMap[n.id]);
      }
    } else {
      root = nodeMap[n.id];
    }
  });
  return root;
}

const socket = io();

const GoalPlanner: React.FC = () => {
  const [userGoal, setUserGoal] = useState<string>("");
  const [goalTree, setGoalTree] = useState<TreeNode | null>(null);
  const [llmMetrics, setLlmMetrics] = useState<any>({});

  // NEW: BFS/DFS mode toggle
  const [mode, setMode] = useState<"bfs" | "dfs">("bfs");

  // For the popup:
  const [selectedNode, setSelectedNode] = useState<StepNode | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const containerWidth = 3200;
  const containerHeight = 2400;
  const svgWidth = 8000;
  const svgHeight = 6000;

  useEffect(() => {
    socket.on("goalPlanProgress", (updatedFlatNodes: StepNode[]) => {
      console.log("Received goalPlanProgress update:", updatedFlatNodes);
      const hierarchical = buildHierarchy(updatedFlatNodes);
      setGoalTree(hierarchical);
    });

    socket.on("goalPlanComplete", (finalFlatNodes: StepNode[]) => {
      console.log("Received goalPlanComplete update:", finalFlatNodes);
      const hierarchical = buildHierarchy(finalFlatNodes);
      setGoalTree(hierarchical);
    });

    socket.on("goalPlanError", (errorMsg: string) => {
      alert("Error during goal planning: " + errorMsg);
      console.error("Socket event 'goalPlanError':", errorMsg);
    });

    socket.on("sharedState", (state: any) => {
      setLlmMetrics(state.llmMetrics);
    });

    return () => {
      socket.off("goalPlanProgress");
      socket.off("goalPlanComplete");
      socket.off("goalPlanError");
      socket.off("sharedState");
    };
  }, []);

  const startPlanning = () => {
    if (!userGoal.trim()) {
      alert("Please enter a goal first.");
      return;
    }
    setGoalTree(null);
    socket.emit("startGoalPlan", { goal: userGoal, mode });
  };

  const toggleMode = () => {
    setMode((prevMode) => (prevMode === "bfs" ? "dfs" : "bfs"));
  };

  useEffect(() => {
    if (!goalTree || !svgRef.current) {
      d3.select(svgRef.current).selectAll("*").remove();
      return;
    }
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Build a D3 hierarchy
    const root = d3.hierarchy(goalTree, (d) => d.substeps);

    // We let the standard tree layout do its job
    const treeLayout = d3
      .tree<TreeNode>()
      .nodeSize([100, 50])
      .separation(() => 1.6);

    treeLayout(root);

    const g = svg
      .append("g")
      .attr("transform", `translate(${svgWidth / 2}, 50)`);

    const linkGenerator = d3
      .linkVertical<HierarchyPointLink<TreeNode>, HierarchyPointNode<TreeNode>>()
      .x((d) => d.x!)
      .y((d) => d.y!);

    const links = root.links() as HierarchyPointLink<TreeNode>[];
    g.selectAll("path.link")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", (d) => linkGenerator(d) ?? "")
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 2);

    const nodeGroup = g
      .selectAll("g.node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      // On click, we capture that node's data
      .on("click", (_, d) => {
        setSelectedNode(d.data); // store StepNode in state
      });

    // Simple text + background rectangle approach
    nodeGroup.each(function (d) {
      const group = d3.select(this);
      const labelText = d.data.funcCall
        ? `${d.data.step} => ${d.data.funcCall}`
        : d.data.step;

      const textElement = group
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("font-size", "12px")
        .style("fill", "#fff")
        .text(labelText);

      const bbox = (textElement.node() as SVGTextElement).getBBox();
      const paddingRect = 8;
      const rectWidth = bbox.width + paddingRect * 2;
      const rectHeight = bbox.height + paddingRect * 2;

      group
        .insert("rect", "text")
        .attr("x", -rectWidth / 2)
        .attr("y", -rectHeight / 2)
        .attr("width", rectWidth)
        .attr("height", rectHeight)
        .attr("rx", 6)
        .attr("ry", 6)
        .attr("fill", "#4CAF50")
        .attr("stroke", "#2E7D32")
        .attr("stroke-width", 2);
    });
  }, [goalTree]);

  useEffect(() => {
    if (!goalTree) return;
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      const leftOffset = (svgWidth - containerWidth) / 2;
      containerRef.current.scrollLeft = leftOffset > 0 ? leftOffset : 0;
    }
  }, [goalTree]);

  // Render the selected node's debug prompt in a simple modal
  const closeModal = () => {
    setSelectedNode(null);
  };

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", padding: 20 }}>
      <h1>Goal Planner (D3 Tree)</h1>

      <section style={{ marginBottom: 20, textAlign: "center" }}>
        <label htmlFor="goal-input">Enter Your Goal:</label>
        <input
          id="goal-input"
          type="text"
          value={userGoal}
          onChange={(e) => setUserGoal(e.target.value)}
          placeholder="e.g., build a house"
          style={{ marginLeft: 10, marginRight: 10, padding: 6 }}
        />
        <button onClick={startPlanning} style={{ padding: "6px 12px" }}>
          Start Planning
        </button>
      </section>

      <section style={{ marginBottom: 20, textAlign: "center" }}>
        <p>
          Current Mode: <strong>{mode.toUpperCase()}</strong>
        </p>
        <button onClick={toggleMode}>
          Switch to {mode === "bfs" ? "DFS" : "BFS"}
        </button>
      </section>

      <div
        ref={containerRef}
        style={{
          width: `${containerWidth}px`,
          height: `${containerHeight}px`,
          overflow: "auto",
          border: "1px solid #ccc",
          margin: "0 auto",
        }}
      >
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          style={{ background: "#f9f9f9" }}
        />
      </div>

      <section style={{ marginTop: 20 }}>
        <h2>LLM Metrics</h2>
        <pre
          style={{
            background: "#f9f9f9",
            padding: 10,
            borderRadius: 4,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(llmMetrics, null, 2)}
        </pre>
      </section>

      {/* Simple Modal to show debugPrompt */}
      {selectedNode && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 8,
              maxWidth: "90%",
              maxHeight: "80%",
              overflow: "auto",
              cursor: "auto",
            }}
            onClick={(e) => e.stopPropagation()} // to avoid closing when clicking inside
          >
            <h3>LLM Prompt for Node</h3>
            <pre
              style={{
                backgroundColor: "#eee",
                padding: 10,
                borderRadius: 4,
              }}
            >
              {selectedNode.debugPrompt ?? "(No debug prompt stored for this node.)"}
            </pre>
            <button onClick={closeModal}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoalPlanner;