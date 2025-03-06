//src/prompts/GoalBreakdown.ts
import { formatInventory } from "./helpers/helpers";
import { SharedAgentState } from "../sharedAgentState";

export const goalBreakdownPrompt: string = `Break down a task in Minecraft for my bot to complete and output the steps in JSON format.

# How To Breakdown Steps

1. Identify the task that needs to be broken down. Only generate steps and criteria that are applicable to Minecraft gameplay. Do not introduce extraneous concerns like 'gather warm clothing' that do not exist in Minecraft.
2. Determine the key actions required to complete the task. Do not include a step unless it is specific. Always specify quantities of items in parentheses. Do not mention crafting tables or furnaces. When a step involves crafting, just say craft *item*(*amount*). When a step involves smelting in a furnace just say smelt *initial item* to get *desired item*(*amount*).
3. Break these actions down into steps.
4. Ensure each step is concise and follows the logical order of completion.

# Output Format

Output the steps as a JSON object with a single key "steps" whose value is an array of step strings. For example:

{
  "steps": ["Step 1", "Step 2", "Step 3"]
}

# Considerations
These tasks are for a bot to complete, not a human. Never use terms like "look for", "listen for".
The bot knows where everything is, so don't reference finding or how to locate things. For example, if a step involves mining iron ore, don't say "find iron ore", just say "mine iron ore(amount)".
Again, never mention having to find things. The bot knows where EVERYTHING is. It NEVER has to locate things. It ALWAYS knows where EVERYTHING is.
Never mention tools. The bot will always determine what tools and equipment it needs to complete a task.

# Examples

**Input:** Farm wheat  
**Output:** {"steps": ["Get seeds(3)", "till soil(3)", "plant seeds(3)", "water crops(3)", "harvest wheat(3)"]}

**Input:** Get wooden pickaxe (1)  
**Output:** {"steps": ["Get wood(5)", "craft wooden planks(4)", "get sticks(2)", "craft wooden pickaxe(1)"]}

**Input:** Kill the ender dragon  
**Output:** {"steps": ["Get ender pearls(12)", "get blaze rods(6)", "craft blaze powder(12)", "craft eyes of ender(12)", "go to stronghold", "activate end portal", "enter the End", "destroy end crystals", "kill ender dragon"]}

**Input:** Craft a bed  
**Output:** {"steps": ["Get wood(1)", "get wool(3)", "get wooden planks(3)", "craft bed(1)"]}

**Input:** Get an iron sword  
**Output:** {"steps": ["Gather wood(1)", "craft wooden planks(4)", "gather iron ore(2)", "smelt iron ore to get iron ingots(2)", "craft sticks(1)", "craft iron sword(1)"]}

**Input:** Get rotten flesh (6)  
**Output:** {"steps": ["Loot rotten flesh (6) from zombies"]}

**Input:** Get bones (4)  
**Output:** {"steps": ["Loot bones (4) from skeletons"]}

**Input:** Get gunpowder (4)  
**Output:** {"steps": ["Loot gunpowder (6) from creepers"]}
`;


/**
 * Generates the context prompt for the breakdown.
 * Now includes "projected inventory" listing and optional environment data.
 */
export function breakdownContextPrompt(
  step: string,
  context: string,
  inventory: Record<string, number>,
  sharedState?: SharedAgentState
): string {
  // Convert the inventory to a human-readable string
  const inventoryEntries = formatInventory(inventory);
  const invString = inventoryEntries.length
    ? `At this time, your inventory includes: ${inventoryEntries}.`
    : ``;

  let environmentDetails = "";
  if (sharedState) {
    const { playersNearby, visibleBlockTypes, visibleMobs, botHealth, botHunger } = sharedState;

    // Basic example of adding environment data:
    if (playersNearby && playersNearby.length > 0) {
      environmentDetails += `\nPlayers nearby: ${playersNearby.join(", ")}.`;
    }
    if (visibleBlockTypes) {
      const blockList = Object.keys(visibleBlockTypes.BlockTypes || {});
      if (blockList.length > 0) {
        environmentDetails += `\nVisible block types include: ${blockList.join(", ")}.`;
      }
    }
    if (visibleMobs) {
      const mobList = visibleMobs.Mobs.map((m) => m.name);
      if (mobList.length > 0) {
        environmentDetails += `\nVisible mobs include: ${mobList.join(", ")}.`;
      }
    }

    environmentDetails += `\nYour health is ${botHealth} and your hunger is ${botHunger}.`;
  }

  return `As you are deciding what steps to include in your breakdown of "${step}", keep in mind that your character has already done the following things (listed as steps and substeps): ${context}. Avoid redundant work.
For example, if a previous step acquired a needed resource, and the current step involves crafting using that resource, do not write a step for acquiring the resource. You already have it.
Assume you have all materials acquired in previous steps. Also assume your character already has all necessary equipment.

${invString}

Additional environment context:
${environmentDetails}
  `;
}

export function getGoalToFuncCallPrompt(
  step: string
): string {
  return `
Given a step, determine if this step can be completed in its ENTIRETY by a bot using JUST ONE of the following methods:

  • mine(goalBlock: string, count: number)
  • craft(goalItem: string, amount: number)
  • place(blockType: string)
  • attack(mobType: string)
  • lootFromMob(mobType: string, mobLootItem: string, count:number)
  • smelt(inputItemName: string, outputItemName: string, quantity: number)
  • plantCrop(cropName: string)
  • harvestCrop(cropName: string, count:number OR "all")
  • sortInventory()
  • placeChest()
  • storeItemInChest(itemName: string, count: number)
  • retrieveItemFromChest(itemName: string, count: number)
  • find_biome(biome: string, goto: Boolean)
  • find_block(block: string, goto: Boolean)
  • activate_end_portal()
  • activate_nether_portal()
  • use_portal()
  • follow_eye()

If the step can be completed COMPLETELY using one of these methods, simply SAY ONLY the corresponding function call in the format methodName(arg1, arg2, ...). Otherwise, SAY ONLY "null".
This is the step: ${step}`;
}