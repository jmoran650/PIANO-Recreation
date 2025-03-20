/*******************
 * src/goalPlanner.ts DEPRECATED
 *******************/
import { v4 as uuidv4 } from "uuid";
import { callLLM, callLLMJsonSchema } from "../utils/llmWrapper";
import {
  goalBreakdownPrompt,
  getGoalToFuncCallPrompt,
  breakdownContextPrompt,
} from "./prompts/GoalBreakdown";

// Import the Minecraft items and blocks data for acquisition descriptions.
import { minecraftItems, minecraftBlocks } from "../data/minecraftItems";
import { SharedAgentState } from "./sharedAgentState";

/**
 * A StepNode in the new shape the frontend expects.
 * - level: how deep the node is (root is level 0)
 * - stepNumber: a sequential number indicating the order steps are processed
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
  debugPrompt?: string; // For debugging the prompt used to generate this node
}

/**
 * The model's breakdown result is guaranteed to match this schema:
 */
interface BreakdownResponse {
  steps: string[];
}

/**
 * Break down a goal (or sub-goal) into a list of actionable steps,
 * now using structured outputs with JSON Schema to ensure we always get:
 *
 *  {
 *    "steps": ["string", "string", ...]
 *  }
 */
async function goal_breakdown(
  step: string,
  context: string,
  inventory: Record<string, number>,
  sharedState?: SharedAgentState
): Promise<{ steps: string[]; debugPrompt: string }> {
  // Build the environment context for the system or user messages:
  const contextString = breakdownContextPrompt(step, context, inventory, sharedState);

  // Build the Acquisition Information section by scanning the original step.
  let acquisitionInfo = "";
  for (const [item, desc] of Object.entries(minecraftItems)) {
    if (step.toLowerCase().includes(item.toLowerCase())) {
      acquisitionInfo += `${item}: ${desc}\n`;
    }
  }
  for (const [block, desc] of Object.entries(minecraftBlocks)) {
    if (step.toLowerCase().includes(block.toLowerCase())) {
      acquisitionInfo += `${block}: ${desc}\n`;
    }
  }
  let acquisitionSection = "";
  if (acquisitionInfo) {
    acquisitionSection = `\nAcquisition Information:\n${acquisitionInfo}`;
  }

  // Prepare system and user messages.
  const systemMsg = goalBreakdownPrompt;
  const userMsg = `${contextString}\nHere is the step for you to breakdown:\n"${step}"\n${acquisitionSection}`;

  // Define the expected JSON Schema.
  const breakdownSchema = {
    "name": "minecraft_steps",
    "schema": {
      "type": "object",
      "properties": {
        "steps": {
          "type": "array",
          "description": "A list of steps to be followed in Minecraft.",
          "items": {
            "type": "string",
            "description": "A single step (of one or more) in the Minecraft process."
          }
        }
      },
      "required": [
        "steps"
      ],
      "additionalProperties": false
    },
    "strict": true
  };

  // Use a try/catch block around the structured LLM call.
  let result;
  try {
    result = await callLLMJsonSchema<BreakdownResponse>(
      systemMsg,
      userMsg,
      breakdownSchema
    );
    console.log(result)
  } catch (error: any) {
    console.error("LLM call error for step:", step, error.message, result);
    if (error.raw) {
      console.error("LLM raw output for step", step, error.raw, result);
    }
    throw error;
  }

  // If there's no valid parsed data (the model didn't produce valid JSON).
  if (!result.parsed) {
    console.error("No structured data returned for step:", step, "Raw output:", result);
    throw new Error(`No structured data returned for step "${step}".`);
  }

  return { steps: result.parsed.steps, debugPrompt: `${systemMsg}\n\nUSER:\n${userMsg}` };
}

/**
 * checkFunctionCallDetailed:
 * This is a small function that tries to see if the entire step
 * can be described as a single function call. We keep it in *plain text* mode for now,
 * not JSON schema, since the function calls can vary widely and are mostly small strings.
 */
async function checkFunctionCallDetailed(
  step: string
): Promise<{ promptUsed: string; response: string }> {
  const promptUsed = getGoalToFuncCallPrompt(step);
  const response = await callLLM(promptUsed); // uses plain text
  return { promptUsed, response: response.trim() };
}

/**
 * Parse function calls like:
 *   mine(wood, 4), craft(iron_pickaxe), smelt(iron_ore, iron_ingot, 2), etc.
 * and update the projectedInventory accordingly.
 */
function updateInventoryFromFuncCall(
  funcCall: string,
  currentInventory: Record<string, number>
): Record<string, number> {
  let call = funcCall.toLowerCase();

  // Helper to parse inside parentheses
  function parseInside(callString: string) {
    const inside = callString.slice(
      callString.indexOf("(") + 1,
      callString.lastIndexOf(")")
    );
    return inside.split(",").map((p) => p.trim());
  }

  const newInv: Record<string, number> = { ...currentInventory };

  if (call.startsWith("mine(")) {
    const parts = parseInside(funcCall);
    if (parts.length === 2) {
      const itemName = parts[0];
      const count = parseInt(parts[1], 10) || 0;
      newInv[itemName] = (newInv[itemName] || 0) + count;
    }
  } else if (call.startsWith("lootfrommob(")) {
    const parts = parseInside(funcCall);
    if (parts.length === 3) {
      const mobLootItem = parts[1];
      const count = parseInt(parts[2], 10) || 0;
      newInv[mobLootItem] = (newInv[mobLootItem] || 0) + count;
    }
  } else if (call.startsWith("craft(")) {
    const parts = parseInside(funcCall);
    if (parts.length >= 1) {
      const itemName = parts[0];
      let quantity = 1;
      if (parts.length === 2) {
        quantity = parseInt(parts[1], 10) || 1;
      }
      newInv[itemName] = (newInv[itemName] || 0) + quantity;
    }
  } else if (call.startsWith("smelt(")) {
    const parts = parseInside(funcCall);
    if (parts.length === 3) {
      const inputItem = parts[0];
      const outputItem = parts[1];
      const quantity = parseInt(parts[2], 10) || 0;
      const haveInput = newInv[inputItem] || 0;
      const actualRemoved = Math.min(haveInput, quantity);
      newInv[inputItem] = haveInput - actualRemoved;
      newInv[outputItem] = (newInv[outputItem] || 0) + actualRemoved;
    }
  } else if (call.startsWith("harvestcrop(")) {
    const parts = parseInside(funcCall);
    if (parts.length === 2) {
      const cropName = parts[0];
      const count = parseInt(parts[1], 10) || 0;
      newInv[cropName] = (newInv[cropName] || 0) + count;
    }
  }

  return newInv;
}

/**
 * buildGoalTree:
 * Iteratively breaks down a single high-level goal into sub-steps,
 * returning a flat array of StepNode objects that form a tree structure (parentId references).
 *
 * We use BFS or DFS expansions, with optional progressCallback for partial results.
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
    projectedInventory: {},
    debugPrompt: undefined,
  };

  let treeNodes: StepNode[] = [root];
  let frontier: StepNode[] = [root];
  let stepCounter = 1;

  while (frontier.length > 0) {
    const currentNode = mode === "bfs" ? frontier.shift()! : frontier.pop()!;

    // Try to interpret the entire step as a single function call (plain text approach).
    if (currentNode.parentId !== null && currentNode.funcCall === null) {
      const { promptUsed, response } = await checkFunctionCallDetailed(currentNode.step);
      if (!response.toLowerCase().includes("null")) {
        // It's a recognized function call.
        const updatedInv = updateInventoryFromFuncCall(
          response,
          currentNode.projectedInventory
        );
        currentNode.projectedInventory = updatedInv;

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
        continue; // No further breakdown needed
      }
    }

    // Build a structured context from previously processed nodes at the same or deeper level
    // so we can avoid re-gathering resources that were already accounted for:
    const relevantNodes = treeNodes.filter(
      (n) =>
        n.stepNumber < currentNode.stepNumber &&
        n.level >= currentNode.level &&
        n.parentId !== null
    );

    const contextGroups: Record<string, string[]> = {};
    for (const n of relevantNodes) {
      if (!n.parentId) continue;
      if (!contextGroups[n.parentId]) {
        contextGroups[n.parentId] = [];
      }
      contextGroups[n.parentId].push(n.step);
    }

    // Summarize each parent's step with sub-steps
    const contextObj: Record<string, string[]> = {};
    for (const parentId in contextGroups) {
      const pNode = treeNodes.find((x) => x.id === parentId);
      if (!pNode) continue;
      contextObj[pNode.step] = contextGroups[parentId];
    }
    const structuredContext = JSON.stringify(contextObj, null, 2);

    // Break down further with structured JSON output
    const { steps: substeps, debugPrompt } = await goal_breakdown(
      currentNode.step,
      structuredContext,
      currentNode.projectedInventory,
      sharedState
    );
    if (substeps.length === 0) {
      // Nothing to expand, skip
      continue;
    }

    // Create child nodes
    const newNodes: StepNode[] = substeps.map((s) => ({
      id: uuidv4(),
      parentId: currentNode.id,
      step: s,
      funcCall: null,
      completionCriteria: null,
      level: currentNode.level + 1,
      stepNumber: stepCounter++,
      projectedInventory: { ...currentNode.projectedInventory },
      debugPrompt,
    }));

    treeNodes.push(...newNodes);
    if (mode === "bfs") {
      frontier.push(...newNodes);
    } else {
      // DFS: push them in reverse so we expand in correct substep order
      for (let i = newNodes.length - 1; i >= 0; i--) {
        frontier.push(newNodes[i]);
      }
    }
    progressCallback?.(treeNodes);
  }

  return treeNodes;
}