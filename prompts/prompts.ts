//prompts/prompts.ts
export const goalBreakdownPrompt: string = `Break down a task in Minecraft for my bot to complete and separate the steps with commas.

# How To Breakdown Steps

1. Identify the task that needs to be broken down. Only generate steps and criteria that are applicable to Minecraft gameplay. Do not introduce extraneous concerns like ‘gather warm clothing’ that do not exist in Minecraft.
2. Determine the key actions required to complete the task. Do not include a step unless it is specific. Always specify quantities of items in parentheses. Do not mention crafting tables or furnaces. When a step involves crafting, just say craft *item*(*amount*). When a step involves smelting in a furnace just say smelt *initial item* to get *desired item*(*amount*).
3. Break these actions down into steps.
4. Ensure each step is concise and follows the logical order of completion.
5. Separate each step with a comma.

# Output Format

A single sentence with steps separated by commas, such as: "Step 1, Step 2, Step 3." Do not use commas except between tasks.

# Considerations 
These tasks are for a bot to complete, not a human. Never use terms like "look for", "listen for".
The bot knows where everything is, so don't reference finding or how to locate things. For example if a step involves mining iron ore, don't say "find iron ore", just say "mine iron ore(amount)"
Again, never mention having to find things. The bot knows where EVERYTHING is. It does not need to locate things.
Never mention tools. The bot will always determine what tools and equipment it needs to complete a task.

# Examples

**Input:** Farm wheat  
**Output:** Get seeds(3), till soil(3), plant seeds(3), water crops(3), harvest wheat(3).

**Input:** Get wooden pickaxe (1)
**Output:** Get wood(5), craft wooden planks(4), get sticks(2), craft wooden pickaxe(1).

**Input:** Kill the ender dragon
**Output:** Get ender pearls(12), get blaze rods(6), craft blaze powder(12), craft eyes of ender(12), go to stronghold, activate end portal, enter the End, destroy end crystals, kill ender dragon.

**Input:**  Craft a bed
**Output:** Get wood(1), get wool(3), get wooden planks(3), craft bed(1).

**Input:** Get an iron sword
**Output:** Gather wood(1), craft wooden planks(4), gather iron ore(2), smelt iron ore to get iron ingots(2), craft sticks(1), craft iron sword(1).

**Input:** Get rotten flesh (6)
**Output:** Loot rotten flesh (6) from zombies.

**Input:** Get bones (4)
**Output:** Loot bones (4) from skeletons.
`;

export function breakdownContextPrompt(step: string, context: string): string {
  return `as you are deciding what steps to include in your breakdown of ${step}, keep in mind that your character has already done the following things: ${context}. Avoid redundant work. Assume you have all materials acquired in previous steps. Also assume the bot already has all necessary equipment.`;
}

export function getGoalToFuncCallPrompt(step: string): string {
  return `Given the step: "${step}", determine if this step can be completed in its ENTIRETY by a bot using JUST ONE of the following methods:

  • mine(goalBlock: string, count: number): Finds, goes to, and extracts the specified number of blocks of the given type from the environment. Getting and/or using the correct equipment to mine is taken care of by this function. Important: All wood is treated as generic, with wood type not being considered. Therefore mine(wood,4) collects 4 wood blocks without consideration of wood type.
  • craft(goalItem: string): Crafts the specified item using available resources. If a crafting table is needed it will be acquired and/or used to craft the item/s.
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


If the step can be completed COMPLETELY using one of these methods, simply SAY ONLY the corresponding function call in the format methodName(argument1, argument2, ...). Otherwise, SAY ONLY "null".`;
}

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

#Examples

**Input**: Kill an enderman
**Output**: 


`;
}


const eventList: string = `"chat" (username, message, translate, jsonMsg, matches)
"whisper" (username, message, translate, jsonMsg, matches)
"actionBar" (jsonMsg, verified)
"message" (jsonMsg, position, sender, verified)
"messagestr" (message, messagePosition, jsonMsg, sender, verified)
"spawn"
"rain"
"weatherUpdate"
"time"
"error" (err)
"death"
"health"
"breath"
"entityAttributes" (entity)
"entitySwingArm" (entity)
"entityHurt" (entity)
"entityDead" (entity)
"entityTaming" (entity)
"entityTamed" (entity)
"entityShakingOffWater" (entity)
"entityEatingGrass" (entity)
"entityHandSwap" (entity)
"entityWake" (entity)
"entityEat" (entity)
"entityCriticalEffect" (entity)
"entityMagicCriticalEffect" (entity)
"entityCrouch" (entity)
"entityUncrouch" (entity)
"entityEquip" (entity)
"entitySleep" (entity)
"entitySpawn" (entity)
"entityElytraFlew" (entity)
"itemDrop" (entity)
"playerCollect" (collector, collected)
"entityGone" (entity)
"entityMoved" (entity)
"entityDetach" (entity, vehicle)
"entityAttach" (entity, vehicle)
"entityUpdate" (entity)
"entityEffect" (entity, effect)
"entityEffectEnd" (entity, effect)
"playerJoined" (player)
"playerUpdated" (player)
"playerLeft" (player)
"blockUpdate" (oldBlock, newBlock)
"blockUpdate:(x, y, z)" (oldBlock, newBlock)
"blockPlaced" (oldBlock, newBlock)
"chunkColumnLoad" (point)
"chunkColumnUnload" (point)
"soundEffectHeard" (soundName, position, volume, pitch)
"hardcodedSoundEffectHeard" (soundId, soundCategory, position, volume, pitch)
"noteHeard" (block, instrument, pitch)
"pistonMove" (block, isPulling, direction)
"chestLidMove" (block, isOpen, block2)
"blockBreakProgressObserved" (block, destroyStage, entity)
"blockBreakProgressEnd" (block, entity)
"diggingCompleted" (block)
"usedFirework" (fireworkEntityId)
"move"
"forcedMove"
"mount"
"dismount" (vehicle)
"windowOpen" (window)
"windowClose" (window)
"sleep"
"wake"
"experience"`