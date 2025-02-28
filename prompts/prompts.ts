//prompts/prompts.ts
export const goalBreakdownPrompt: string =  `Break down a task in Minecraft by one level and separate the steps with commas.

# Steps

1. Identify the task that needs to be broken down. Only generate steps and criteria that are applicable to Minecraft gameplay. Do not introduce extraneous concerns like ‘gather warm clothing’ that do not exist in Minecraft.
2. Determine the key actions required to complete the task. Do not include a step unless it is specific. Always specify quantities of items in parentheses. Do not mention crafting tables or furnaces. When a step involves crafting, just say craft *item*(*amount*). When a step involves smelting in a furnace just say smelt *initial item* to get *desired item*(*amount*).
3. Break these actions down into steps.
4. Ensure each step is concise and follows the logical order of completion.
5. Separate each step with a comma.


# Output Format

A single sentence with steps separated by commas, such as: "Step 1, Step 2, Step 3." Do not use commas except between tasks.

# Examples

**Input:** Build a wooden house  
**Output:** Gather wood, select a location to build, clear space, construct the walls, add the roof.

**Input:** Farm wheat  
**Output:** Gather seeds(3), till soil(3), plant seeds(3), water crops(3), harvest wheat(3).

**Input:** Acquire wooden pickaxe (1)
**Output:** Gather wood(5), craft wooden planks(4), craft sticks(2), craft wooden pickaxe(1).

**Input:** Kill the ender dragon
**Output:** Gather ender pearls(12), gather blaze rods(6), craft blaze powder(12), craft eyes of ender(12), locate stronghold, activate end portal, enter the End, destroy end crystals, engage ender dragon, defeat ender dragon.

**Input:**  Make a bed
**Output:** Gather wood(1), gather wool(3), craft wooden planks(3), craft bed(1).

**Input:** Get an iron sword
**Output:** Gather wood(1), craft wooden planks(4), gather iron ore(2), smelt iron ore to get iron ingots(2), craft sticks(1), craft iron sword(1).

`

export function getGoalToFuncCallPrompt(step: string): string {
    return `Given the step: "${step}", determine if this step can be completed in its ENTIRETY using JUST ONE of the following methods:
  • mine(goalBlock: string, desiredCount: number)
  • craft(goalItem: string)
  • place(blockType: string)
  • attack(mobType: string)
  • placeCraftingTable()
  • useCraftingTable()
  • smelt(inputItemName: string, quantity: number)
  • plantCrop(cropName: string)
  • harvestCrop(cropName: string)
  • equipBestToolForBlock(blockName: string)
  • sortInventory()
  • placeChest()
  • storeItemInChest(itemName: string, count: number)
  • retrieveItemFromChest(itemName: string, count: number)
  
  If the step can be completed COMPLETELY using one of these methods, simply SAY ONLY the corresponding function call in the format 
  methodName(argument1, argument2, ...). Otherwise, SAY ONLY "null".`;
  }