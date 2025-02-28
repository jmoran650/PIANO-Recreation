
export const goalBreakdownPrompt: string =  `Break down a task in Minecraft by one level and separate the steps with commas.
# Important Info #
These steps will eventually be used by a bot that is effectively all-seeing. The bot does not use it's senses to determine things, so do not write steps that include looking for things. The bot will always know where everything is.
Additionally, determining what a bot needs to complete a task outside of items directly involved in the task is outside of your scope. Instead of writing steps based around having a necessary tool or piece of equipment, simply write <NECESSARY_GEAR> for that step.
Another tool you have access to are the following methods:
<COMBAT>(mob): This is to be used to describe the act of attacking a mob until it is dead.
<ACQUIRE>(item, amount): This is to be used to describe acquiring an item. Always specify the item and amount.
<MINE>(block, amount): This is to be used for mining a certain amount of an ore. Always specify the ore and amount. 
<NAME>(place): This is only to be used whenever a place has significance to the bot, such as where it's home is. The coordinates of a place will be determined by the bots current location. Remember that the bot knows where everything is.
<GOTO>(place): This is to be used to go to a certain place. Do not use this unless there is a specific place in mind. Never use this to go to an ore. Remember that the bot knows where all resources are, so it can simply use <MINE>(ore,amount) to go to an ore or resource. <GOTO> is to be used to go to named locations.

# Steps

1. Identify the task that needs to be broken down. Only generate steps and criteria that are applicable to Minecraft gameplay. Do not introduce extraneous concerns like ‘gather warm clothing’ that do not exist in Minecraft.
2. Determine the key actions or components required to complete the task. Always specify quantities of items in parentheses. Do not mention crafting tables or furnaces. When a step involves crafting, just say <CRAFT>(item, amount). When a step involves smelting in a furnace just say <SMELT>(smelted_item, output_item, amount).
3. Break these actions down into steps. When writing steps, always be specific. 
4. Ensure each step is concise and follows the logical order of completion.
5. Separate each step with a "-" Do not ever use "-" outside of separating steps.

# Output Format

A single sentence with steps separated by -, such as: "Step 1 - Step 2 - Step 3." Do not list things within steps, simply separate the steps. End the final step with a period.

# Examples

**Input:** Build a wooden house  
**Output:** <NECESSARY_GEAR>, select a location to build, clear space, construct the walls, add the roof.

**Input:** Farm wheat  
**Output:** <NECESSARY_GEAR>, <ACQUIRE>(seeds,3), prepare soil, plant seeds, water crops, harvest wheat.

**Input:** Acquire wooden pickaxe (1)
**Output:** <NECESSARY_GEAR>-<MINE>(wood,5)-<CRAFT>(wood_planks,4)-<CRAFT>(sticks,2)-<CRAFT>(wooden_pickaxe,1).

**Input:** Kill the ender dragon
**Output:** <NECESSARY_GEAR> - <ACQUIRE>(ender_pearls,12)-<ACQUIRE>(blaze_rods, 6)-<CRAFT>(blaze_powder, 6)-<CRAFT> eyes of ender(12), locate stronghold, activate end portal, enter the End, destroy end crystals, kill ender dragon.

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