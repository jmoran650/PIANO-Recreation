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

Output the steps as a JSON object with a single key "steps" whose value is an array of step strings. 
Output only a JSON object matching the following schema, with no extra text or keys.
For example:
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

This is your current inventory: ${invString}.

Additional environment context:
${environmentDetails}
  `;
}

export function getGoalToFuncCallPrompt(
  step: string
  //inventory: Record<string, number>
): string {
  //const inventoryList = formatInventory(inventory);
  return `
Given a step, determine if this step can be completed in its ENTIRETY by a bot using JUST ONE of the following methods:

  • mine(goalBlock: string, count: number): Finds, goes to, and extracts the specified number of blocks of the given type from the environment. Getting and/or using the correct equipment to mine is taken care of by this function. 
  Important: All wood is treated as generic, with wood type not being considered. Therefore mine(wood,4) collects 4 wood blocks without consideration of wood type.
  • craft(goalItem: string, amount: number): Crafts the specified item using available resources. The bot takes care of acquiring necessary materials for crafting. You do not need to worry about it. If a step says "Craft x from y", call craft(x).
  • place(blockType: string): Places a block of the specified type into the game environment.
  • attack(mobType: string): Finds and attacks the nearest specified mob until it is defeated.
  • lootFromMob(mobType: string, mobLootItem: string, count:number): Finds and kills mobType, collecting loot from the defeated mob, until count of mobLootItem has been acquired.
  • smelt(inputItemName: string, outputItemName: string, quantity: number): Smelts the specified quantity of the input item to get quantity of output item. Fuel is taken care of.
  • plantCrop(cropName: string): Plants the specified crop in suitable farmland. Acquiring seeds and tilling dirt with the appropriate tool is taken care of.
  • harvestCrop(cropName: string, count:number OR "all"): Harvests and collects fully grown crops of the specified type. If count is set to "all", harvests all, otherwise harvests count crops.
  • sortInventory(): Organizes and sorts the items currently held in inventory.
  • placeChest(): Acquires and/or places a chest into the game environment. Appropriate location will be determined by the function.
  • storeItemInChest(itemName: string, count: number): Stores a specified quantity of the given item into an available chest. The appropriate chest will be determined by the function.
  • retrieveItemFromChest(itemName: string, count: number): Goes to and/or retrieves count of itemName from a chest. Which chest the item is in will be determined by the function.
  • find_biome(biome: string, goto: Boolean): Locates the specified biome in the environment. If goto is True the bot will also go to that biome.
  • find_block(block: string, goto: Boolean): Locates a specific block type in the environment. If goto is True the bot will also go to the specified block. Pathfinding is taken care of.
  • activate_end_portal(): Activates an end portal.
  • activate_nether_portal(): Activates a nether portal.
  • shoot_with_arrow(target: string): Shoots an arrow at target until it is dead or destroyed. Can be used to target mobs or other entities.
  • use_portal(): enters a portal. Covers both end portals and nether portals.
  • follow_eye(): Follows an eye of ender to the stronghold.
  
  EXAMPLES: 
  **Input**: "Gather 4 wood"  
**Output**: mine(wood,4)

**Input**: "Craft a pickaxe"  
**Output**: craft(pickaxe,1)

**Input**: "Place a stone block"  
**Output**: place(stone)

**Input**: "Attack a zombie"  
**Output**: attack(zombie)

**Input**: "Enter the nether"
**Output**: null

**Input**: "Loot 3 rotten_flesh from a zombie"  
**Output**: lootFromMob(zombie,rotten_flesh,3)

**Input**: "Smelt 5 iron_ore into 5 iron_ingot"  
**Output**: smelt(iron_ore,iron_ingot,5)

**Input**: "Plant wheat"  
**Output**: plantCrop(wheat)

**Input**: "Harvest all carrots"  
**Output**: harvestCrop(carrots,"all")

**Input**: Decorate the house
**Output**: null

**Input**: Look around
**Output**: null

**Input**: "Sort inventory"  
**Output**: sortInventory()

**Input**: "Place a chest"  
**Output**: placeChest()

**Input**: "Store 20 arrows"  
**Output**: storeItemInChest(arrows,20)

**Input**: "Retrieve 15 coal"  
**Output**: retrieveItemFromChest(coal,15)

If the step can be completed COMPLETELY using one of these methods, simply SAY ONLY the corresponding function call in the format methodName(argument1, argument2, ...). Otherwise, SAY ONLY "null".
This is the step: ${step}`;
}