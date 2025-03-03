import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import * as d3 from "d3";
import { HierarchyPointLink, HierarchyPointNode } from "d3-hierarchy";

export interface StepNode {
  id: string;
  step: string;
  funcCall: string | null;
  completionCriteria: string | null;
  parentId: string | null;
}

interface TreeNode extends StepNode {
  substeps: TreeNode[];
}

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

  // NEW: Keep track of BFS or DFS mode (default BFS).
  const [mode, setMode] = useState<"bfs" | "dfs">("bfs");

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

  // Function to start planning. We now emit both goal and mode to the server.
  const startPlanning = () => {
    if (!userGoal.trim()) {
      alert("Please enter a goal first.");
      return;
    }
    setGoalTree(null);
    socket.emit("startGoalPlan", { goal: userGoal, mode });
  };

  // Toggle BFS/DFS. This button can switch the mode state.
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

    // Build a D3 hierarchy from the tree data.
    const root = d3.hierarchy(goalTree, (d) => d.substeps);

    // Define a maximum characters per line for wrapping.
    const maxChars = 20;
    // Create a tree layout with fixed node size and dynamic separation.
    const treeLayout = d3
      .tree<TreeNode>()
      .nodeSize([100, 50])
      .separation((a, b) => {
        // These values roughly match what we use for rendering text:
        const charWidth = 7;
        const padding = 8;
        const extraMargin = 10;
        // Estimate node width based on the maximum characters per line
        const estimateNodeWidth = (label: string) => {
          const effectiveChars = Math.min(label.length, maxChars);
          return effectiveChars * charWidth + padding * 2;
        };
        const labelA = a.data.funcCall
          ? `${a.data.step} => ${a.data.funcCall}`
          : a.data.step;
        const labelB = b.data.funcCall
          ? `${b.data.step} => ${b.data.funcCall}`
          : b.data.step;
        const widthA = estimateNodeWidth(labelA);
        const widthB = estimateNodeWidth(labelB);
        return (widthA / 2 + widthB / 2 + extraMargin) / 100;
      });

    treeLayout(root);

    // Center the group within the SVG.
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

    // Helper function to wrap text based on max characters.
    const wrapText = (text: string, maxChars: number) => {
      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";
      words.forEach((word) => {
        if ((currentLine + word).length > maxChars) {
          lines.push(currentLine.trim());
          currentLine = word + " ";
        } else {
          currentLine += word + " ";
        }
      });
      if (currentLine.trim() !== "") {
        lines.push(currentLine.trim());
      }
      return lines;
    };

    const nodeGroup = g
      .selectAll("g.node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    nodeGroup.each(function (d) {
      const group = d3.select(this);
      const labelText = d.data.funcCall
        ? `${d.data.step} => ${d.data.funcCall}`
        : d.data.step;
      const wrappedLines = wrapText(labelText, maxChars);

      // Create the multi-line text element.
      const textElement = group
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("font-size", "12px")
        .style("fill", "#fff");

      wrappedLines.forEach((line, i) => {
        textElement
          .append("tspan")
          .text(line)
          .attr("x", 0)
          .attr("dy", i === 0 ? "0em" : "1.2em");
      });

      // Get bounding box after text is rendered.
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

      {/* NEW: BFS/DFS toggle button */}
      <section style={{ marginBottom: 20, textAlign: "center" }}>
        <p>Current Mode: <strong>{mode.toUpperCase()}</strong></p>
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
    </div>
  );
};

export default GoalPlanner;