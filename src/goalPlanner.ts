/*******************
 * src/goalPlanner.ts
 *******************/
import { v4 as uuidv4 } from "uuid";
import { callLLM } from "../utils/llmWrapper";
import {
  goalBreakdownPrompt,
  getGoalToFuncCallPrompt,
  breakdownContextPrompt,
} from "./prompts/GoalBreakdown";

// Import the Minecraft items and blocks data for acquisition descriptions.
import { minecraftItems, minecraftBlocks } from "../data/minecraftItems";
import { SharedAgentState } from "./sharedAgentState";

/**
 * Helper function to escape special characters in a string so that it can be used in a regular expression.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A StepNode in the new shape the frontend expects.
 * - level: how deep the node is (root is level 0)
 * - stepNumber: a sequential number indicating the order the steps are processed
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
  debugPrompt?: string;  // For debugging the prompt used to generate this node
}

/**
 * Break down a goal (or sub-goal) into a list of actionable steps in JSON format.
 * Now includes additional context of previously completed tasks, a projected inventory,
 * and optionally some environment data from sharedAgentState.
 *
 * This updated function appends an extra section at the end of the prompt—"Acquisition Information"—
 * which lists any items or blocks mentioned in the original step along with their acquisition descriptions.
 */
async function goal_breakdown(
  step: string,
  context: string,
  inventory: Record<string, number>,
  sharedState?: SharedAgentState
): Promise<{ steps: string[]; debugPrompt: string }> {
  // Build the environment context (plus "previous steps" context) prompt:
  const contextString = breakdownContextPrompt(step, context, inventory, sharedState);

  // Build the Acquisition Information section by scanning the original step.
  let acquisitionInfo = "";
  for (const [item, desc] of Object.entries(minecraftItems)) {
    const escapedItem = escapeRegExp(item);
    const pattern = new RegExp(`\\b${escapedItem}(s)?\\s*(\$begin:math:text$\\\\d+\\$end:math:text$)?\\b`, "i");
    if (pattern.test(step)) {
      acquisitionInfo += `${item}: ${desc}\n`;
    }
  }
  for (const [block, desc] of Object.entries(minecraftBlocks)) {
    const escapedBlock = escapeRegExp(block);
    const pattern = new RegExp(`\\b${escapedBlock}(s)?\\s*(\$begin:math:text$\\\\d+\\$end:math:text$)?\\b`, "i");
    if (pattern.test(step)) {
      acquisitionInfo += `${block}: ${desc}\n`;
    }
  }

  let acquisitionSection = "";
  if (acquisitionInfo) {
    acquisitionSection = `\nAcquisition Information:\n${acquisitionInfo}`;
  }

  const prompt = `${goalBreakdownPrompt}
${contextString} 
Here is the step for you to breakdown:
"${step}"
${acquisitionSection}`;

  const response = await callLLM(prompt);

  // Use a regex to extract JSON content from the response (handles markdown formatting)
  const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = response.match(jsonRegex);
  let jsonStr: string;
  if (match && match[1]) {
    jsonStr = match[1];
  } else {
    jsonStr = response;
  }

  let parsedResponse: { steps: string[] };
  try {
    parsedResponse = JSON.parse(jsonStr);
  } catch (error: any) {
    console.error("Error parsing JSON response: ", error, "Response: ", response);
    throw new Error("Failed to parse JSON response from LLM");
  }
  return { steps: parsedResponse.steps, debugPrompt: prompt };
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
 *   craft(iron_pickaxe)
 *   craft(iron_pickaxe, 1)
 *   smelt(iron_ore, iron_ingot, 2)
 *   harvestCrop(wheat, 3)
 *
 * and update the projectedInventory accordingly.
 */
function updateInventoryFromFuncCall(
  funcCall: string,
  currentInventory: Record<string, number>
): Record<string, number> {
  // Extract the function call substring.
  const match = funcCall.match(
    /(mine\([^)]*\)|lootfrommob\([^)]*\)|craft\([^)]*\)|smelt\([^)]*\)|harvestcrop\([^)]*\))/i
  );
  if (match) {
    funcCall = match[0];
  }
  const lower = funcCall.toLowerCase();

  // Helper to parse inside parentheses
  function parseInside(callString: string) {
    const inside = callString.slice(
      callString.indexOf("(") + 1,
      callString.lastIndexOf(")")
    );
    return inside.split(",").map((p) => p.trim());
  }

  // Start with a copy of the current inventory.
  const newInv: Record<string, number> = { ...currentInventory };

  if (lower.includes("mine(")) {
    const parts = parseInside(funcCall);
    if (parts.length === 2) {
      const itemName = parts[0];
      const count = parseInt(parts[1], 10) || 0;
      if (count > 0) {
        newInv[itemName] = (newInv[itemName] || 0) + count;
      }
    }
  } else if (lower.includes("lootfrommob(")) {
    const parts = parseInside(funcCall);
    if (parts.length === 3) {
      const mobLootItem = parts[1];
      const count = parseInt(parts[2], 10) || 0;
      if (count > 0) {
        newInv[mobLootItem] = (newInv[mobLootItem] || 0) + count;
      }
    }
  } else if (lower.includes("craft(")) {
    const parts = parseInside(funcCall);
    if (parts.length >= 1) {
      const itemName = parts[0];
      let quantity = 1;
      if (parts.length === 2) {
        quantity = parseInt(parts[1], 10) || 1;
      }
      newInv[itemName] = (newInv[itemName] || 0) + quantity;
    }
  } else if (lower.includes("smelt(")) {
    const parts = parseInside(funcCall);
    if (parts.length === 3) {
      const inputItem = parts[0];
      const outputItem = parts[1];
      const quantity = parseInt(parts[2], 10) || 0;
      if (quantity > 0) {
        const haveInput = newInv[inputItem] || 0;
        const actualRemoved = Math.min(haveInput, quantity);
        newInv[inputItem] = haveInput - actualRemoved;
        newInv[outputItem] = (newInv[outputItem] || 0) + actualRemoved;
      }
    }
  } else if (lower.includes("harvestcrop(")) {
    const parts = parseInside(funcCall);
    if (parts.length === 2) {
      const cropName = parts[0];
      const count = parseInt(parts[1], 10) || 0;
      if (count > 0) {
        newInv[cropName] = (newInv[cropName] || 0) + count;
      }
    }
  }
  return newInv;
}

/**
 * Build a goal tree, returning a *flat array* of StepNode.
 * By default, it does breadth-first expansion, but you can pass `mode = "dfs"`
 * to break down each branch fully before moving on.
 *
 * A progress callback is invoked whenever a new set of nodes is appended.
 *
 * Each node carries its projectedInventory that is updated when a function call is detected.
 * Also, every node now includes a debugPrompt that contains the prompt used to generate this node.
 *
 * The optional `sharedState` parameter will pass environment data into the breakdown prompt.
 */
export async function buildGoalTree(
  original: string,
  mode: "bfs" | "dfs" = "bfs",
  progressCallback?: (updatedTree: StepNode[]) => void,
  sharedState?: SharedAgentState
): Promise<StepNode[]> {
  // Create root node with level 0 and stepNumber 0.
  const root: StepNode = {
    id: uuidv4(),
    parentId: null,
    step: original,
    funcCall: null,
    completionCriteria: null,
    level: 0,
    stepNumber: 0,
    projectedInventory: {}, // start with empty inventory
    debugPrompt: undefined, // root has no prior prompt
  };

  // This will store all nodes, starting with the root.
  let treeNodes: StepNode[] = [root];

  // Use an array as a queue (for BFS) or stack (for DFS).
  let frontier: StepNode[] = [root];

  // Global step counter (starting at 1 because root is stepNumber=0).
  let stepCounter = 1;

  while (frontier.length > 0) {
    let currentNode: StepNode;
    if (mode === "bfs") {
      currentNode = frontier.shift()!;
    } else {
      currentNode = frontier.pop()!;
    }

    // If this is not the root node, check if we can represent it directly as a single function call.
    if (currentNode.parentId !== null && currentNode.funcCall === null) {
      const { promptUsed, response } = await checkFunctionCallDetailed(currentNode.step);
      if (!response.toLowerCase().includes("null")) {
        // Update the current node's inventory based on the function call.
        const updatedInv = updateInventoryFromFuncCall(response, currentNode.projectedInventory);
        currentNode.projectedInventory = updatedInv;

        // Create a child node that holds the function call.
        const childNode: StepNode = {
          id: uuidv4(),
          parentId: currentNode.id,
          step: currentNode.step,
          funcCall: response,
          completionCriteria: null,
          level: currentNode.level + 1,
          stepNumber: stepCounter++,
          projectedInventory: updatedInv,
          debugPrompt: promptUsed,
        };
        treeNodes.push(childNode);
        progressCallback?.(treeNodes);

        // No further breakdown needed for this branch (we stop).
        continue;
      }
    }

    // Build a structured context from previously processed sibling/ancestor nodes.
    const filteredNodes = treeNodes.filter(
      (n) =>
        n.stepNumber < currentNode.stepNumber &&
        n.level >= currentNode.level &&
        n.parentId !== null
    );

    const contextGroups: Record<string, string[]> = {};
    filteredNodes.forEach((n) => {
      if (n.parentId) {
        if (!contextGroups[n.parentId]) {
          contextGroups[n.parentId] = [];
        }
        contextGroups[n.parentId].push(n.step);
      }
    });

    // Present as a small object summarizing each parent step and its sub-steps:
    const contextObj: Record<string, string[]> = {};
    for (const parentId in contextGroups) {
      const parentNode = treeNodes.find((node) => node.id === parentId);
      if (!parentNode) continue;
      contextObj[parentNode.step] = contextGroups[parentId];
    }
    const structuredContext = JSON.stringify(contextObj, null, 2);

    // Break down the current step further:
    const { steps: substeps, debugPrompt } = await goal_breakdown(
      currentNode.step,
      structuredContext,
      currentNode.projectedInventory,
      sharedState // pass optional sharedState
    );
    if (substeps.length === 0) {
      continue;
    }

    // Generate child nodes from these substeps
    const newNodes: StepNode[] = substeps.map((s) => ({
      id: uuidv4(),
      parentId: currentNode.id,
      step: s,
      funcCall: null,
      completionCriteria: null,
      level: currentNode.level + 1,
      stepNumber: stepCounter++,
      projectedInventory: { ...currentNode.projectedInventory },
      debugPrompt, // Attach the debug prompt used for this breakdown
    }));

    treeNodes.push(...newNodes);

    if (mode === "bfs") {
      frontier.push(...newNodes);
    } else {
      for (let i = newNodes.length - 1; i >= 0; i--) {
        frontier.push(newNodes[i]);
      }
    }
    progressCallback?.(treeNodes);
  }

  return treeNodes;
}