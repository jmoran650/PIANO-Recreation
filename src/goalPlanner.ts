//src/goalPlanner.ts
import { v4 as uuidv4 } from "uuid";
import { callLLM } from "../utils/llmWrapper";
import {
  goalBreakdownPrompt,
  getGoalToFuncCallPrompt,
  breakdownContextPrompt,
} from "../prompts/prompts";

/**
 * A StepNode in the new shape the frontend expects.
 * - level: how deep the node is (root is level 0)
 * - stepNumber: a sequential number indicating the number of steps in the order they are processed
 * - projectedInventory: track items acquired so far in the plan
 */
export interface StepNode {
  id: string;
  parentId: string | null;
  step: string; // The text of this step
  funcCall: string | null; // If not null, this step is a function call
  completionCriteria: string | null; // Additional field, optional
  level: number;
  stepNumber: number;
  projectedInventory: Record<string, number>;
  debugPrompt?: string;  // new
}

/**
 * Break down a goal (or sub-goal) into a list of actionable steps separated by commas.
 * Now includes additional context of previously completed tasks and a projected inventory.
 */
async function goal_breakdown(
  step: string,
  context: string,
  inventory: Record<string, number>
): Promise<string[]> {
  const contextString = breakdownContextPrompt(step, context, inventory);
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
 * Helper that calls the function-call LLM prompt, returning both the prompt used
 * and the LLM's output.
 */
async function checkFunctionCallDetailed(
    step: string
  ): Promise<{ promptUsed: string; response: string }> {
    const promptUsed = getGoalToFuncCallPrompt(step);
    const response = await callLLM(promptUsed);
    return { promptUsed, response: response.trim() };
  }

/**
 * Parse function calls like:
 *   mine(wood, 4)
 *   lootFromMob(skeleton, bones, 3)
 * If it's one of these "get item" calls, add the item(s) to projectedInventory.
 */
function updateInventoryFromFuncCall(
  funcCall: string,
  currentInventory: Record<string, number>
): Record<string, number> {
  // Make a shallow copy so we don't mutate the original
  const newInv = { ...currentInventory };

  const lower = funcCall.toLowerCase();

  // Example patterns:
  //   mine(wood, 4)
  //   lootFromMob(skeleton, bones, 3)
  // We parse out the arguments by parentheses, then split by comma.
  if (lower.startsWith("mine(")) {
    // Format: mine(goalBlock, count)
    // We find "mine(" then parse the inside: "wood, 4"
    const inside = funcCall
      .slice(funcCall.indexOf("(") + 1, funcCall.indexOf(")"))
      .trim();
    // e.g. "wood, 4"
    const parts = inside.split(",");
    if (parts.length === 2) {
      const itemName = parts[0].trim();
      const countStr = parts[1].trim();
      const count = parseInt(countStr, 10) || 0;
      if (count > 0) {
        // update inventory
        newInv[itemName] = (newInv[itemName] || 0) + count;
      }
    }
  } else if (lower.startsWith("lootfrommob(")) {
    // Format: lootFromMob(mobType, mobLootItem, count)
    // inside e.g. "skeleton, bones, 3"
    const inside = funcCall
      .slice(funcCall.indexOf("(") + 1, funcCall.indexOf(")"))
      .trim();
    const parts = inside.split(",");
    if (parts.length === 3) {
      const mobLootItem = parts[1].trim(); // e.g. "bones"
      const countStr = parts[2].trim();
      const count = parseInt(countStr, 10) || 0;
      if (count > 0) {
        newInv[mobLootItem] = (newInv[mobLootItem] || 0) + count;
      }
    }
  }
  // If needed, you can add more patterns for "get item" style calls.
  return newInv;
}

/**
 * Build a goal tree, returning a *flat array* of StepNode. 
 * By default, it does breadth-first expansion, but you can pass `mode = "dfs"` 
 * to break down each branch fully before moving on.
 *
 * A progress callback is invoked whenever a new set of nodes is appended.
 *
 * We keep a `projectedInventory` in each node to reflect items acquired so far.
 * That inventory is passed along to child nodes, and updated if a child is 
 * discovered to be a "mine(...)" or "lootFromMob(...)" step, etc.
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
    projectedInventory: {}, // start with empty
    debugPrompt: undefined, // root has no prior prompt
  };

  // This will store all nodes, root first
  let treeNodes: StepNode[] = [root];

  // We'll use an array, but treat it as a queue (for BFS) or stack (for DFS)
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

    // For non-root nodes (or even root if desired), check for direct function call possibility:
    if (currentNode.parentId !== null && currentNode.funcCall === null) {
        const { promptUsed, response } = await checkFunctionCallDetailed(
            currentNode.step
          );
          if (!response.toLowerCase().includes("null")) {
            // Found a valid function call => create a terminal child node
            const newInv = updateInventoryFromFuncCall(
              response,
              currentNode.projectedInventory
            );

        const childNode: StepNode = {
          id: uuidv4(),
          parentId: currentNode.id,
          step: currentNode.step,
          funcCall: response,
          completionCriteria: null,
          level: currentNode.level + 1,
          stepNumber: stepCounter++,
          projectedInventory: newInv,
          debugPrompt: promptUsed,
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
      (n) =>
        n.stepNumber < currentNode.stepNumber &&
        n.level >= currentNode.level &&
        n.parentId !== null
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
      structuredContext += `${parentNode.step} : (${contextGroups[parentId].join(
        ", "
      )}) ; `;
    }

    // Now break the current step down further:
    const substeps = await goal_breakdown(
      currentNode.step,
      structuredContext,
      currentNode.projectedInventory
    );
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
      // Inherit parent's projectedInventory (no new items until we see a function call)
      projectedInventory: { ...currentNode.projectedInventory },
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