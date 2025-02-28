//src/goalPlanner.ts
import { callLLM } from "../utils/llmWrapper";
import { goalBreakdownPrompt, getGoalToFuncCallPrompt } from "../prompts/prompts";

/**
 * StepNode interface for the hierarchical tree.
 */
export interface StepNode {
  id: number;
  step: string;
  funcCall: string | null;
  completionCriteria: string | null;
  substeps: StepNode[];
}

// Unique id generator
let idCounter = 0;
function nextId(): number {
  return ++idCounter;
}

/**
 * Potentially returns a function call if the step can be handled by exactly one method.
 */
export async function goal_to_func_call(step: string): Promise<string | null> {
  const prompt = getGoalToFuncCallPrompt(step);
  const response = await callLLM(prompt);
  if (response.toLowerCase().includes("null")) {
    return null;
  }
  return response.trim();
}

/**
 * Break down a goal into a list of steps separated by commas.
 */
async function goal_breakdown(goal: string): Promise<string[]> {
  const prompt = `${goalBreakdownPrompt}
Break down the following goal into a series of actionable steps separated by commas:
"${goal}"`;
  const response = await callLLM(prompt);
  const steps = response
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return steps;
}

/**
 * Generate a single-sentence completion criterion for a given step.
 */
async function generateCompletionCriteria(step: string): Promise<string> {
  const prompt = `Given the step: "${step}", generate completion criteria that takes into account multiple ways to satisfy the step. For example, if the step is "get wood(4)", possible criteria could be: "The step is complete if the player has 4 wood in their inventory OR has mined 4 wood blocks." Provide a concise sentence.`;
  const criteria = await callLLM(prompt);
  return criteria.trim();
}

/**
 * Recursively build a hierarchical goal tree. If a step is atomic (one function call),
 * it won't have sub-steps; otherwise we break it down.
 *
 * The onProgress callback is invoked each time we have an updated (partial) tree.
 */
export async function buildGoalTree(
  goal: string,
  onProgress?: (tree: StepNode) => void
): Promise<StepNode> {
  // Try a single function call
  const funcCall = await goal_to_func_call(goal);
  if (funcCall) {
    const criteria = await generateCompletionCriteria(goal);
    const node: StepNode = {
      id: nextId(),
      step: goal,
      funcCall,
      completionCriteria: criteria,
      substeps: []
    };
    if (onProgress) {
      // Clone so React sees a fresh reference
      onProgress(JSON.parse(JSON.stringify(node)));
      // Yield to the event loop so partial updates flush
      await new Promise((r) => setTimeout(r, 0));
    }
    return node;
  }

  // Otherwise, break the step down
  const subSteps = await goal_breakdown(goal);

  // If we get back the exact same step, treat it as atomic
  if (subSteps.length === 1 && subSteps[0] === goal) {
    const criteria = await generateCompletionCriteria(goal);
    const node: StepNode = {
      id: nextId(),
      step: goal,
      funcCall: null,
      completionCriteria: criteria,
      substeps: []
    };
    if (onProgress) {
      onProgress(JSON.parse(JSON.stringify(node)));
      await new Promise((r) => setTimeout(r, 0));
    }
    return node;
  }

  // We have multiple sub-steps
  const criteria = await generateCompletionCriteria(goal);
  const children: StepNode[] = [];
  const parentNode: StepNode = {
    id: nextId(),
    step: goal,
    funcCall: null,
    completionCriteria: criteria,
    substeps: children
  };
  // Immediately emit the new parent
  if (onProgress) {
    onProgress(JSON.parse(JSON.stringify(parentNode)));
    await new Promise((r) => setTimeout(r, 0));
  }

  // Build each child sub-tree
  for (const s of subSteps) {
    const child = await buildGoalTree(s, onProgress);
    children.push(child);
    // Emit the updated parent after adding each child
    if (onProgress) {
      onProgress(JSON.parse(JSON.stringify(parentNode)));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return parentNode;
}