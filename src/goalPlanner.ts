//src/goalPlanner.ts
import { v4 as uuidv4 } from "uuid";
import { callLLM } from "../utils/llmWrapper";
import { goalBreakdownPrompt, getGoalToFuncCallPrompt, breakdownContextPrompt } from "../prompts/prompts";

/**
 * A StepNode in the new shape the frontend expects.
 * - level: how deep the node is (root is level 0)
 * - stepNumber: a sequential number indicating the number of steps in the order they are processed
 */
export interface StepNode {
  id: string;
  parentId: string | null;
  step: string;                  // The text of this step
  funcCall: string | null;       // If not null, this step is a function call
  completionCriteria: string | null; // Additional field, optional
  level: number;
  stepNumber: number;
}

/**
 * Break down a goal (or sub-goal) into a list of actionable steps separated by commas.
 * Now includes additional context of previously completed tasks, structured by their parent step.
 */
async function goal_breakdown(step: string, context: string = ""): Promise<string[]> {
  let contextString = "";
  if (context.trim().length > 0) {
    contextString = breakdownContextPrompt(step, context);
  }
  const prompt = `${goalBreakdownPrompt}
${contextString} Here is the step for you to breakdown:
"${step}"`;
  const response = await callLLM(prompt);
  return response
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Check if we can directly map this step to a single function call.
 * If yes, returns the function call string; if not, returns something containing "null".
 */
async function checkFunctionCall(step: string): Promise<string> {
  const prompt = getGoalToFuncCallPrompt(step);
  const response = await callLLM(prompt);
  return response.trim();
}

/**
 * Build a goal tree, returning a *flat array* of StepNode. 
 * By default, it does breadth-first expansion, but you can pass `mode = "dfs"` 
 * to break down each branch fully before moving on.
 *
 * A progress callback is invoked whenever a new set of nodes is appended.
 *
 * Context logic: when generating context for a node, we include all nodes that 
 * have a lower stepNumber and with a level >= currentNode.level (and a parent).
 * They are grouped by their parent, so that the context is presented as:
 *   "ParentStep : (ChildStep1, ChildStep2); ..."
 */
export async function buildGoalTree(
  original: string,
  mode: "bfs" | "dfs" = "bfs",
  progressCallback?: (updatedTree: StepNode[]) => void
): Promise<StepNode[]> {
  // Create root node with level 0 and stepNumber 0
  const root: StepNode = {
    id: uuidv4(),
    parentId: null,
    step: original,
    funcCall: null,
    completionCriteria: null,
    level: 0,
    stepNumber: 0,
  };

  // This will store all nodes, root first
  let treeNodes: StepNode[] = [root];

  // We'll use an array, but treat it as a queue (for BFS) or stack (for DFS)
  // BFS => shift from the front, push to the back
  // DFS => pop from the back, push to the back
  let frontier: StepNode[] = [root];

  // Global step counter (starting at 1 because root is 0)
  let stepCounter = 1;

  while (frontier.length > 0) {
    // Get the current node:
    let currentNode: StepNode;
    if (mode === "bfs") {
      // breadth-first
      currentNode = frontier.shift()!;
    } else {
      // depth-first
      currentNode = frontier.pop()!;
    }

    // Only call checkFunctionCall for non-root nodes:
    if (currentNode.parentId !== null && currentNode.funcCall === null) {
      const funcCall = await checkFunctionCall(currentNode.step);
      if (!funcCall.toLowerCase().includes("null")) {
        // Found a valid function call => create a terminal child node
        const childNode: StepNode = {
          id: uuidv4(),
          parentId: currentNode.id,
          step: currentNode.step,
          funcCall: funcCall,
          completionCriteria: null,
          level: currentNode.level + 1,
          stepNumber: stepCounter++,
        };
        treeNodes.push(childNode);
        progressCallback?.(treeNodes);
        // No further breakdown for this branch
        continue;
      }
    }

    // Build a structured context for the next breakdown:
    // We'll gather nodes with a lower stepNumber, level >= currentNode.level, that have a parent.
    const filteredNodes = treeNodes.filter(
      (n) => n.stepNumber < currentNode.stepNumber && n.level >= currentNode.level && n.parentId !== null
    );

    // Group these nodes by their parentId.
    const contextGroups: Record<string, string[]> = {};
    filteredNodes.forEach((n) => {
      if (n.parentId) {
        if (!contextGroups[n.parentId]) {
          contextGroups[n.parentId] = [];
        }
        contextGroups[n.parentId].push(n.step);
      }
    });

    // Create a structured context string in the format: 
    //   "ParentStep : (ChildStep, ChildStep); OtherParentStep : (ChildStep)..."
    let structuredContext = "";
    for (const parentId in contextGroups) {
      const parentNode = treeNodes.find((node) => node.id === parentId);
      if (!parentNode) continue;
      structuredContext += `${parentNode.step} : (${contextGroups[parentId].join(", ")}) ; `;
    }

    // Now break the current step down further:
    const substeps = await goal_breakdown(currentNode.step, structuredContext);
    if (substeps.length === 0) {
      // Nothing to add
      continue;
    }

    // Create new nodes at level+1, and assign sequential stepNumbers
    const newNodes: StepNode[] = substeps.map((s) => ({
      id: uuidv4(),
      parentId: currentNode.id,
      step: s,
      funcCall: null,
      completionCriteria: null,
      level: currentNode.level + 1,
      stepNumber: stepCounter++,
    }));

    // Add them to the global list
    treeNodes.push(...newNodes);

    // Depending on BFS or DFS, push them differently
    if (mode === "bfs") {
      // BFS: push at the end in reading order
      frontier.push(...newNodes);
    } else {
      // DFS: push each newNode onto the "stack" in reverse so that
      // the first substep is processed first.
      for (let i = newNodes.length - 1; i >= 0; i--) {
        frontier.push(newNodes[i]);
      }
    }

    // Notify listeners we have new partial expansions
    progressCallback?.(treeNodes);
  }

  return treeNodes;
}