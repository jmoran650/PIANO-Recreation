// src/goalPlanner.ts

import { callLLM } from "../utils/llmWrapper";
import { goalBreakdownPrompt, getGoalToFuncCallPrompt } from "../prompts/prompts";

export interface PlanStep {
  step: string;
  funcCall: string | null; // null if unsolvable by our current system
  completionCriteria: string | null; // new field for completion criteria
}

// Instead of reading a file, we directly use the imported prompt.
const longTermGoalPrompt = goalBreakdownPrompt;

/**
 * goal_to_func_call:
 * Given a step, ask the LLM whether the step can be completed in its totality using one of the following methods:
 *   • mine(goalBlock: string, desiredCount: number)
 *   • craft(goalItem: string)
 *   • place(blockType: string)
 *   • attack(mobType: string)
 *   • placeCraftingTable()
 *   • useCraftingTable()
 *   • smelt(inputItemName: string, quantity: number)
 *   • plantCrop(cropName: string)
 *   • harvestCrop(cropName: string)
 *   • equipBestToolForBlock(blockName: string)
 *   • sortInventory()
 *   • placeChest()
 *   • storeItemInChest(itemName: string, count: number)
 *   • retrieveItemFromChest(itemName: string, count: number)
 *
 * The LLM is instructed to return the function call (e.g., "mine(iron_ore, 3)") if applicable,
 * or the word "null" if not.
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
 * goal_breakdown:
 * Uses the instructions from the goal breakdown prompt and the given goal to produce a comma-separated list of steps.
 */
export async function goal_breakdown(goal: string): Promise<string[]> {
  const prompt = `${longTermGoalPrompt}
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
 * generateCompletionCriteria:
 * Given a step, generate completion criteria that takes into account multiple ways to satisfy the step.
 * For example, for "get wood(4)" criteria might be:
 * "The step is complete if the player has 4 wood in their inventory OR has mined 4 wood blocks."
 */
export async function generateCompletionCriteria(step: string): Promise<string> {
  const prompt = `Given the step: "${step}", generate completion criteria that takes into account multiple ways to satisfy the step. For example, if the step is "get wood(4)", possible criteria could be: "The step is complete if the player has 4 wood in their inventory OR has mined 4 wood blocks." Provide a concise sentence.`;
  const criteria = await callLLM(prompt);
  return criteria.trim();
}

/**
 * planGoalWithCriteria:
 * Uses an iterative queue to break down a natural language goal into steps.
 * The onProgress callback is called after processing each step.
 *
 * Modification: The very first iteration (original goal) is always broken down into sub-steps.
 * After that, each step is processed using goal_to_func_call before possibly breaking it down further.
 * For each atomic step, completion criteria are generated.
 */
export async function planGoal(
  goal: string,
  onProgress: (progress: { queue: string[]; finalPlan: PlanStep[] }) => void
): Promise<PlanStep[]> {
  let queue: string[] = [goal];
  let finalPlan: PlanStep[] = [];
  let initialBreakdownDone = false;

  while (queue.length > 0) {
    const currentStep = queue.shift()!;

    if (!initialBreakdownDone) {
      // Break down the original goal first.
      const subSteps = await goal_breakdown(currentStep);
      if (subSteps.length === 1 && subSteps[0] === currentStep) {
        const criteria = await generateCompletionCriteria(currentStep);
        finalPlan.push({
          step: currentStep,
          funcCall: null,
          completionCriteria: criteria,
        });
        onProgress({ queue: [...queue], finalPlan: [...finalPlan] });
      } else {
        queue.push(...subSteps);
        initialBreakdownDone = true;
        onProgress({ queue: [...queue], finalPlan: [...finalPlan] });
      }
    } else {
      // Process subsequent steps.
      const funcCall = await goal_to_func_call(currentStep);
      if (funcCall) {
        const criteria = await generateCompletionCriteria(currentStep);
        finalPlan.push({
          step: currentStep,
          funcCall,
          completionCriteria: criteria,
        });
        onProgress({ queue: [...queue], finalPlan: [...finalPlan] });
      } else {
        const subSteps = await goal_breakdown(currentStep);
        if (subSteps.length === 1 && subSteps[0] === currentStep) {
          const criteria = await generateCompletionCriteria(currentStep);
          finalPlan.push({
            step: currentStep,
            funcCall: null,
            completionCriteria: criteria,
          });
          onProgress({ queue: [...queue], finalPlan: [...finalPlan] });
        } else {
          queue.push(...subSteps);
          onProgress({ queue: [...queue], finalPlan: [...finalPlan] });
        }
      }
    }
  }

  return finalPlan;
}