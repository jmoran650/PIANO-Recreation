//viewer/GoalPlanner.tsx
import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import * as d3 from "d3";
import { HierarchyPointLink, HierarchyPointNode } from "d3-hierarchy";

// Our hierarchical tree node interface.
export interface StepNode {
  id: number;
  step: string;
  funcCall: string | null;
  completionCriteria: string | null;
  substeps: StepNode[];
}

// Create a Socket.IO connection.
const socket = io();

/**
 * A simple deep clone function for our tree nodes.
 * (Using JSON methods for brevity; adjust if your data gets more complex.)
 */
function deepCloneTree(node: StepNode): StepNode {
  return JSON.parse(JSON.stringify(node));
}

/**
 * Recursively searches for a node within the tree whose step matches the target.
 */
function findNodeByStep(node: StepNode, targetStep: string): StepNode | null {
  console.log(
    `findNodeByStep: Checking node ${node.id} ("${node.step}") against target "${targetStep}"`
  );
  if (node.step === targetStep) return node;
  for (const child of node.substeps) {
    const found = findNodeByStep(child, targetStep);
    if (found) return found;
  }
  return null;
}

/**
 * Recursively updates a node in the tree with an incoming node (by matching step).
 * Returns a new tree object.
 */
function updateNodeInTree(tree: StepNode, incoming: StepNode): StepNode {
  if (tree.step === incoming.step) {
    return mergeTreesImmutable(tree, incoming);
  } else {
    return {
      ...tree,
      substeps: tree.substeps.map(child => updateNodeInTree(child, incoming))
    };
  }
}

/**
 * An immutable merge function for our goal tree.
 * It returns a new tree object that represents the merge of `existing` and `incoming`.
 */
function mergeTreesImmutable(
  existing: StepNode | null,
  incoming: StepNode
): StepNode {
  console.log("mergeTreesImmutable: Starting merge");
  console.log("Existing tree:", existing);
  console.log("Incoming tree:", incoming);

  if (!existing) {
    console.log("mergeTreesImmutable: No existing tree, returning deep clone of incoming");
    return deepCloneTree(incoming);
  }
  const newTree = deepCloneTree(existing);
  if (newTree.id === incoming.id) {
    console.log(`mergeTreesImmutable: Matching IDs for node ${newTree.id}`);
    newTree.step = incoming.step;
    newTree.funcCall = incoming.funcCall;
    newTree.completionCriteria = incoming.completionCriteria;
    incoming.substeps.forEach(incomingChild => {
      const idx = newTree.substeps.findIndex(child => child.id === incomingChild.id);
      if (idx !== -1) {
        console.log(`mergeTreesImmutable: Found child with matching id ${incomingChild.id}, merging...`);
        newTree.substeps[idx] = mergeTreesImmutable(newTree.substeps[idx], incomingChild);
      } else {
        console.log(`mergeTreesImmutable: No child with id ${incomingChild.id} found. Adding incoming child.`);
        newTree.substeps.push(deepCloneTree(incomingChild));
      }
    });
    console.log("mergeTreesImmutable: Merge complete for node", newTree.id, "Result:", newTree);
    return newTree;
  } else {
    console.log(`mergeTreesImmutable: Root IDs do not match. Existing root id: ${newTree.id}, Incoming root id: ${incoming.id}`);
    const match = findNodeByStep(newTree, incoming.step);
    if (match) {
      console.log(`mergeTreesImmutable: Found matching node by step for incoming node ${incoming.id}, updating tree.`);
      return updateNodeInTree(newTree, incoming);
    } else {
      console.log(`mergeTreesImmutable: No matching node found for incoming node ${incoming.id}. Attaching as new child.`);
      newTree.substeps.push(deepCloneTree(incoming));
      return newTree;
    }
  }
}

const GoalPlanner: React.FC = () => {
  const [userGoal, setUserGoal] = useState<string>("");
  const [goalTree, setGoalTree] = useState<StepNode | null>(null);
  const [llmMetrics, setLlmMetrics] = useState<any>({});
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Socket event listeners
  useEffect(() => {
    socket.on("goalPlanProgress", (updatedTree: StepNode) => {
      console.log("Socket event 'goalPlanProgress' received:", updatedTree);
      setGoalTree(prevTree => {
        const merged = mergeTreesImmutable(prevTree, updatedTree);
        console.log("After merging goalPlanProgress, goalTree is:", merged);
        return merged;
      });
    });
    socket.on("goalPlanComplete", (finalTree: StepNode) => {
      alert("Goal planning complete!");
      console.log("Socket event 'goalPlanComplete' received:", finalTree);
      setGoalTree(prevTree => {
        const merged = mergeTreesImmutable(prevTree, finalTree);
        console.log("After merging goalPlanComplete, goalTree is:", merged);
        return merged;
      });
    });
    socket.on("goalPlanError", (errorMsg: string) => {
      alert("Error during goal planning: " + errorMsg);
      console.error("Socket event 'goalPlanError':", errorMsg);
    });
    socket.on("sharedState", (state: any) => {
      console.log("Socket event 'sharedState' received:", state);
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
      alert("Please enter a valid goal.");
      return;
    }
    console.log("Starting planning with userGoal:", userGoal);
    setGoalTree(null);
    socket.emit("startGoalPlan", userGoal);
  };

  // D3 rendering code
  useEffect(() => {
    if (!goalTree) {
      console.log("D3 rendering: No goalTree to render");
      return;
    }
    console.log("D3 rendering: Rendering goalTree:", goalTree);

    // Set up dimensions.
    const width = 1000;
    const height = 800;
    const margin = { top: 50, right: 50, bottom: 50, left: 50 };

    // Clear any previous rendering.
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create a D3 hierarchy.
    const root = d3.hierarchy(goalTree, (d: StepNode) => d.substeps);
    console.log("D3 rendering: Total nodes found:", root.descendants().length);
    root.descendants().forEach((node, i) => {
      console.log(`Node ${i}: id ${node.data.id}, step "${node.data.step}", x: ${node.x}, y: ${node.y}`);
    });

    // Compute layout.
    const treeLayout = d3
      .tree<StepNode>()
      .size([height - margin.top - margin.bottom, width - margin.left - margin.right]);
    treeLayout(root);

    // Create a group for the tree.
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Generate links.
    const linkGenerator = d3
      .linkHorizontal<HierarchyPointLink<StepNode>, HierarchyPointNode<StepNode>>()
      .x(d => d.y)
      .y(d => d.x);

    g.selectAll("path.link")
      .data(root.links())
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", d => linkGenerator(d as d3.HierarchyPointLink<StepNode>) || "")
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 2);

    // Render nodes.
    const nodeGroup = g.selectAll("g.node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeGroup.append("circle")
      .attr("r", 20)
      .attr("fill", "#4CAF50")
      .attr("stroke", "#2E7D32")
      .attr("stroke-width", 2);

    nodeGroup.append("text")
      .attr("dy", 4)
      .attr("x", d => (d.children ? -25 : 25))
      .style("text-anchor", d => (d.children ? "end" : "start"))
      .text(d => d.data.funcCall ? `${d.data.step} → ${d.data.funcCall}` : d.data.step)
      .style("font-size", "12px")
      .style("fill", "#fff");
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
          onChange={e => setUserGoal(e.target.value)}
          placeholder="e.g., get tnt"
          style={{ marginLeft: 10, marginRight: 10, padding: 6 }}
        />
        <button onClick={startPlanning} style={{ padding: "6px 12px" }}>
          Start Planning
        </button>
      </section>
      <svg ref={svgRef} width={1000} height={800} style={{ border: "1px solid #ccc", background: "#f9f9f9" }} />
      <section style={{ marginTop: 20 }}>
        <h2>LLM Metrics</h2>
        <pre style={{ background: "#f9f9f9", padding: 10, borderRadius: 4, overflowX: "auto" }}>
          {JSON.stringify(llmMetrics, null, 2)}
        </pre>
      </section>
    </div>
  );
};

export default GoalPlanner;