//prompts/prompts.ts


export function realityCheckStepPrompt(step: string): string {
  return `You are the Reality Checker for a Minecraft bot. Your responsibility is to validate that each step provided makes sense in for a bot to complete in vanilla Minecraft. You must:

- Confirm the step is achievable in vanilla Minecraft.
- Remove or clearly suggest replacing nonsensical or impossible instructions.
- Briefly explain your reasoning for removing or modifying each invalid step.

Examples:

Input: "Gather warm clothing before heading to the snow biome."
Output:
INVALID STEP - Clothing doesn't affect temperature or exist as warm/cold clothing in vanilla Minecraft. Remove this step entirely.

Input: "Gather necessary equipment."
Output:
TOO VAGUE - This step should be expanded into explicit items using the Quartermaster.

Input: "Craft a shield to defend against skeletons."
Output:
VALID STEP - Shields exist and effectively block arrows.

Input: "listen for hissing sounds"
Output:
INVALID STEP - A bot can not listen for something.

Now, validate and clarify the following step:
Input: "${step}"
Output:
  `;
}

export function quartermasterPrompt(step: string): string {
  return `You are the Reality Checker for a Minecraft bot. Your responsibility is to validate that each step provided makes sense in vanilla Minecraft. You must:

- Confirm the step is achievable in vanilla Minecraft.
- Remove or clearly suggest replacing nonsensical or impossible instructions.
- Briefly explain your reasoning for removing or modifying each invalid step.
- Confirm the step does not reference 

Examples:

Input: "Gather warm clothing before heading to the snow biome."
Output:
INVALID STEP - Clothing doesn't affect temperature or exist as warm/cold clothing in vanilla Minecraft. Remove this step entirely.

Input: "Gather necessary equipment."
Output:
TOO VAGUE - This step should be expanded into explicit items using the Quartermaster.

Input: "Craft a shield."
Output:
VALID STEP - Shields exist and effectively block arrows.

Now, validate and clarify the following step:
Input: "{input_step}"
Output:`;
}

export function completionCriteriaPrompt(goal: string): string {
  return `Given the input task, goal, or step: "${goal}", generate a list of clear and specific completion criteria that, when met, indicate that the task, goal, or step has been successfully completed.

# How To Generate Completion Criteria

1. Analyze the input to determine all measurable and verifiable conditions required for completion.
2. Identify specific actions, items, or quantities that define successful completion.
3. Avoid vague or ambiguous language; use clear, quantifiable criteria (e.g., get item(3), craft item(1)).
4. List the criteria in a concise manner, separating them with commas.
5. Ensure that the criteria directly align with the input task, goal, or step.

# Output Format

A single sentence listing one or more criteria, with each criterion separated by a comma.
`;
}

