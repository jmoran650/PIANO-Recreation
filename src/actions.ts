import { Bot } from "mineflayer";
import { Navigation } from "./navigation";
import { Vec3 } from "vec3";
import minecraftData from "minecraft-data";
import { Block } from "prismarine-block";
import { SharedAgentState } from "./sharedAgentState";
import { Observer } from "./observer";

declare module "mineflayer" {
  interface BotEvents {
    stoppedAttacking: () => void;
  }
}

export class Actions {
  private bot: Bot;
  private navigation: Navigation;
  private mcData: any;
  private sharedState: SharedAgentState;
  private observer: Observer;

  constructor(
    bot: Bot,
    navigation: Navigation,
    sharedState: SharedAgentState,
    observer: Observer
  ) {
    this.bot = bot;
    this.navigation = navigation;
    this.mcData = minecraftData("1.21.4");
    this.sharedState = sharedState;
    this.observer = observer;
  }

  /**
   * -----------------------
   * 1) Existing Methods
   * -----------------------
   */

  /**
   * Mines a specified block type until the desired number of blocks has been mined.
   */
  async mine(goalBlock: string, desiredCount: number): Promise<void> {
    this.sharedState.addPendingAction(`Mine ${goalBlock} x${desiredCount}`);

    let count = 0;
    while (count < desiredCount) {
      // Find blocks that match the desired type within a 50 block radius.
      const blockPositions = this.bot.findBlocks({
        point: this.bot.entity.position,
        matching: (block) => block && block.name === goalBlock,
        maxDistance: 50,
      });

      if (blockPositions.length === 0) {
        this.bot.chat(`No ${goalBlock} found nearby.`);
        break;
      }

      // Determine the closest block position by distance.
      const botPos = this.bot.entity.position;
      let closestBlockPos = blockPositions[0];
      let closestDistance = botPos.distanceTo(closestBlockPos);

      for (let i = 1; i < blockPositions.length; i++) {
        const currentDistance = botPos.distanceTo(blockPositions[i]);
        if (currentDistance < closestDistance) {
          closestDistance = currentDistance;
          closestBlockPos = blockPositions[i];
        }
      }

      const block = this.bot.blockAt(closestBlockPos);
      if (!block) continue;

      // Equip the best tool for mining this block.
      await this.equipBestToolForBlock(goalBlock);

      // Move to the closest block's position.
      await this.navigation.move(
        closestBlockPos.x,
        closestBlockPos.y,
        closestBlockPos.z
      );

      try {
        await this.bot.dig(block);
        count++;
        this.bot.chat(
          `Mined ${count} of ${desiredCount} ${goalBlock} blocks.`
        );
      } catch (err) {
        this.bot.chat(`Error mining block: ${err}`);
      }

      // Brief pause between mining actions.
      await this.sleep(100);
    }
    this.bot.chat(`finished mining after mining ${count} blocks`);
  }

  /**
   * -----------------------
   * UPDATED craft Method
   * -----------------------
   *
   * Now uses a 30-block threshold for deciding to place a new crafting table.
   * If the bot doesn't have a crafting table in inventory, it attempts to craft one (as last resort).
   */
  public async craft(goalItem: string): Promise<void> {
    this.sharedState.addPendingAction(`Craft ${goalItem}`);

    // 1) Look up item data
    const itemData = this.mcData.itemsByName[goalItem];
    if (!itemData) {
      this.bot.chat(`No item data found for "${goalItem}".`);
      return;
    }
    const itemId = itemData.id;
    this.bot.chat(`The item.id for "${goalItem}" is: ${itemId}`);

    // 2) If this is NOT the crafting table, we need to find or place one
    //    (If it IS a crafting table, we can craft it in our own 2x2 grid.)
    let tableBlock: Block | null = null;
    if (goalItem !== "crafting_table") {
      tableBlock = await this.findOrPlaceCraftingTable();
      if (!tableBlock) {
        this.bot.chat("Could not find or place a crafting table!");
        throw new Error("Failed to acquire crafting table.");
      }
    }

    // 3) Query possible recipes ignoring whether we have the materials
    const possibleRecipesAll = this.bot.recipesAll(itemId, null, tableBlock);
    if (!possibleRecipesAll || possibleRecipesAll.length === 0) {
      this.bot.chat(`No recipe found for "${goalItem}".`);
      throw new Error(`No recipe for ${goalItem}`);
    }

    // 4) Query recipes that the bot can actually perform given current inventory
    const possibleRecipesFor = this.bot.recipesFor(itemId, null, 1, tableBlock);
    if (!possibleRecipesFor || possibleRecipesFor.length === 0) {
      this.bot.chat(`Missing ingredients to craft "${goalItem}".`);
      throw new Error(`Don't have enough/correct ingredients to craft ${goalItem}`);
    }

    // 5) Attempt crafting with the first valid recipe
    for (const recipe of possibleRecipesFor) {
      try {
        // If it's not the table, use the table we found/placed; otherwise use null
        await this.bot.craft(recipe, 1, goalItem !== "crafting_table" ? (tableBlock ?? undefined) : undefined);
        this.bot.chat(`Successfully crafted "${goalItem}".`);
        return;
      } catch (err) {
        this.bot.chat(`Failed crafting "${goalItem}" with a recipe: ${err}`);
      }
    }

    this.bot.chat(`Could not craft "${goalItem}" with any available recipe.`);
  }


  /**
   * -----------------------------------
   * UPDATED helper: findOrPlaceCraftingTable
   * -----------------------------------
   *
   * 1) Update knowledge of visible blocks.
   * 2) Check known crafting table positions and pick the closest.
   * 3) If we have a valid table within 30 blocks, use it.
   *    Otherwise:
   *      - Check if we have a crafting_table item in inventory. If not, attempt to craft one.
   *      - Then place it.
   */
  private async findOrPlaceCraftingTable(): Promise<Block | null> {
    // 1) Gather visible blocks
    const visibleBlocks = await this.observer.getVisibleBlockTypes();

    // If there's a newly discovered crafting table, add it to the sharedState
    if (visibleBlocks.BlockTypes["crafting_table"]) {
      const vPos = visibleBlocks.BlockTypes["crafting_table"];
      const knownAlready = this.sharedState.craftingTablePositions.some(
        (p) => p.x === vPos.x && p.y === vPos.y && p.z === vPos.z
      );
      if (!knownAlready) {
        this.sharedState.addCraftingTablePosition(new Vec3(vPos.x, vPos.y, vPos.z));
      }
    }

    // 2) Among all known crafting tables, pick the closest
    let bestPos: Vec3 | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const cPos of this.sharedState.craftingTablePositions) {
      const dist = this.bot.entity.position.distanceTo(cPos);
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = cPos;
      }
    }

    // 3) If we have a table within 30 blocks, verify it's still there and use it
    if (bestPos && bestDist <= 30) {
      const maybeTable = this.bot.blockAt(bestPos);
      if (maybeTable && maybeTable.name === "crafting_table") {
        await this.navigation.move(bestPos.x, bestPos.y, bestPos.z);
        return maybeTable;
      } else {
        // It's no longer valid, remove it from sharedState
        this.removeCraftingTableFromShared(bestPos);
      }
    }

    // If we do NOT have a valid table within 30 blocks:
    // - Check if we have a crafting table in inventory
    // - If not, attempt to craft one as a last resort
    const tableItemInInventory = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName["crafting_table"].id, null, false
    );
    if (!tableItemInInventory) {
      this.bot.chat("No crafting table in inventory; attempting to craft one...");
      try {
        // The craft method can craft a table in the 2x2 grid if resources are available
        await this.craft("crafting_table");
      } catch (err) {
        this.bot.chat(`Failed to craft a crafting_table: ${err}`);
        // If we still don't have it after that, we abort
        const stillNoTable = this.bot.inventory.findInventoryItem(
          this.mcData.itemsByName["crafting_table"].id, null, false
        );
        if (!stillNoTable) {
          this.bot.chat("Still no crafting table after trying to craft.");
          return null;
        }
      }
    }

    // Now we definitely have a table item (either we had one or successfully crafted one)
    // So let's place it.
    await this.placeCraftingTable();

    // Check if we have a newly placed table
    let placedBlock: Block | null = null;
    let placedPos: Vec3 | null = null;
    let placedDist = Number.POSITIVE_INFINITY;

    // Among the known positions, find the closest again
    for (const cPos of this.sharedState.craftingTablePositions) {
      const dist = this.bot.entity.position.distanceTo(cPos);
      if (dist < placedDist) {
        placedDist = dist;
        placedPos = cPos;
      }
    }

    if (placedPos) {
      placedBlock = this.bot.blockAt(placedPos);
      if (placedBlock?.name === "crafting_table") {
        // Move to it and return
        await this.navigation.move(placedPos.x, placedPos.y, placedPos.z);
        return placedBlock;
      }
    }

    // If all else fails, return null
    return null;
  }


  private removeCraftingTableFromShared(pos: Vec3): void {
    const arr = this.sharedState.craftingTablePositions;
    const idx = arr.findIndex(
      (c) => c.x === pos.x && c.y === pos.y && c.z === pos.z
    );
    if (idx !== -1) arr.splice(idx, 1);
  }

  /**
   * Places a crafting table from inventory, if possible.
   */
  async placeCraftingTable(): Promise<void> {
    this.sharedState.addPendingAction("Place Crafting Table");

    const table = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName.crafting_table.id,
      null,
      false
    );
    if (!table) {
      this.bot.chat("I don't have a crafting table in my inventory!");
      return;
    }

    const safePos = this.findSafePlacement();
    if (!safePos) {
      this.bot.chat("No valid spot to place the crafting table!");
      return;
    }

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.bot.lookAt(safePos.offset(0.5, 0.5, 0.5));
        const referenceBlock = this.bot.blockAt(safePos.offset(0, -1, 0));
        if (!referenceBlock) {
          this.bot.chat("No block beneath to place the crafting table on.");
          return;
        }
        await this.bot.equip(table, "hand");
        await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
        this.bot.chat("Crafting table placed!");

        // Record the new table's location in SharedAgentState
        const placedPos = referenceBlock.position.offset(0, 1, 0);
        this.sharedState.addCraftingTablePosition(placedPos);
        return;
      } catch (err) {
        this.bot.chat(`Attempt ${attempt} to place crafting table failed: ${err}`);
        if (attempt < maxRetries) {
          await this.sleep(1000);
        } else {
          this.bot.chat("All attempts to place crafting table failed.");
        }
      }
    }
  }

  /**
   * Places a block (e.g., furnace or crafting bench).
   */
  async place(blockType: string): Promise<void> {
    this.sharedState.addPendingAction(`Place ${blockType}`);

    let blockItem = this.bot.inventory
      .items()
      .find((item) => item.name === blockType);
    if (!blockItem) {
      this.bot.chat(`${blockType} not in inventory; trying to craft...`);
      await this.craft(blockType);
      blockItem = this.bot.inventory
        .items()
        .find((item) => item.name === blockType);
      if (!blockItem) {
        this.bot.chat(`Unable to obtain ${blockType}.`);
        return;
      }
    }

    try {
      await this.bot.equip(blockItem, "hand");
    } catch (err) {
      this.bot.chat(`Failed to equip ${blockType}: ${err}`);
      return;
    }

    const referencePos = this.bot.entity.position.offset(2, 0, 0);
    const maybeRefBlock = this.bot.blockAt(referencePos);
    if (!maybeRefBlock) {
      this.bot.chat("No reference block below me to place onto.");
      return;
    }
    const refBlock: Block = maybeRefBlock;

    try {
      await this.bot.placeBlock(refBlock, new Vec3(0, 1, 0));
      this.bot.chat(`Placed ${blockType}.`);
    } catch (err) {
      this.bot.chat(`Error placing ${blockType}: ${err}`);
    }
  }

  /**
   * Attacks a specified type of mob using the mineflayer-pvp plugin.
   */
  async attack(mobType: string): Promise<void> {
    this.sharedState.addPendingAction(`Attack ${mobType}`);

    const pvp = (this.bot as any).pvp;
    if (!pvp) {
      const errorMsg =
        "Error: mineflayer-pvp plugin not loaded. Attack action disabled.";
      this.bot.chat(errorMsg);
      throw new Error(errorMsg);
    }

    const mobs = Object.values(this.bot.entities).filter(
      (entity: any) =>
        entity.name && entity.name.toLowerCase() === mobType.toLowerCase()
    );
    if (mobs.length === 0) {
      this.bot.chat(`No ${mobType} found nearby to attack.`);
      return;
    }

    // Select nearest mob
    const target = mobs.reduce((nearest: any, mob: any) => {
      return this.bot.entity.position.distanceTo(mob.position) <
        this.bot.entity.position.distanceTo(nearest.position)
        ? mob
        : nearest;
    }, mobs[0]);

    this.bot.chat(`Attacking the nearest ${mobType}...`);
    try {
      if (typeof pvp.attack === "function") {
        pvp.attack(target);
        this.bot.once("stoppedAttacking", () => {
          if (this.bot.entities[target.id]) {
            this.bot.chat(`Target still alive, attacking again!`);
            this.attack(mobType);
          } else {
            this.bot.chat("Target has been killed!");
          }
        });
      } else {
        this.bot.chat("pvp.attack is not a function. Plugin mismatch?");
      }
    } catch (err: unknown) {
      const errMsg: string = err instanceof Error ? err.message : String(err);
      this.bot.chat(`Error while attacking ${mobType}: ${errMsg}`);
    }
  }

  /**
   * Uses a nearby crafting table by right-clicking it.
   */
  async useCraftingTable(): Promise<void> {
    this.sharedState.addPendingAction("Use Crafting Table");

    const positions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block: any) => block && block.name === "crafting_table",
      maxDistance: 4.4,
      count: 1,
    });
    if (positions.length === 0) {
      this.bot.chat("No crafting table nearby.");
      return;
    }
    const pos = positions[0];
    const block = this.bot.blockAt(pos);
    if (!block) {
      this.bot.chat("Crafting table block not found.");
      return;
    }
    try {
      await this.bot.activateBlock(block);
      this.bot.chat("Used the crafting table.");
    } catch (err) {
      this.bot.chat(
        "Failed to use crafting table: " +
          (err instanceof Error ? err.message : err)
      );
    }
  }

  /**
   * -----------------------
   * 2) New/Existing Methods
   * -----------------------
   */

  async smelt(inputItemName: string, quantity: number): Promise<void> {
    this.sharedState.addPendingAction(`Smelt ${inputItemName} x${quantity}`);

    let furnaceBlock = this.findNearbyFurnace(3);
    if (!furnaceBlock) {
      this.bot.chat("No furnace nearby. Attempting to place one...");
      await this.placeFurnace();
      furnaceBlock = this.findNearbyFurnace(3);
      if (!furnaceBlock) {
        this.bot.chat("Unable to place a furnace. Aborting smelt.");
        return;
      }
    }

    try {
      await this.bot.activateBlock(furnaceBlock);
      this.bot.chat("Opened furnace...");
    } catch (err) {
      this.bot.chat("Failed to open furnace: " + err);
      return;
    }

    if (!(await this.addFuelToFurnace())) {
      this.bot.chat("Failed to add fuel to furnace. Aborting smelt.");
      return;
    }

    const neededCount = this.moveItemToFurnaceInput(inputItemName, quantity);
    if (neededCount === 0) {
      this.bot.chat(`No "${inputItemName}" found to smelt!`);
      return;
    } else {
      this.bot.chat(`Smelting up to ${neededCount} ${inputItemName}...`);
    }

    await this.sleep(5000);
    if (this.bot.currentWindow) {
      this.bot.closeWindow(this.bot.currentWindow);
    }
    this.bot.chat(
      `Smelting process done or in progress. Check furnace/inventory!`
    );
  }

  private async placeFurnace(): Promise<void> {
    let furnaceItem = this.bot.inventory
      .items()
      .find((item) => item.name === "furnace");
    if (!furnaceItem) {
      this.bot.chat("No furnace in inventory; trying to craft...");
      await this.craft("furnace");
      furnaceItem = this.bot.inventory
        .items()
        .find((item) => item.name === "furnace");
      if (!furnaceItem) {
        this.bot.chat("Unable to craft furnace!");
        return;
      }
    }

    try {
      await this.bot.equip(furnaceItem, "hand");
    } catch (err) {
      this.bot.chat(`Failed to equip furnace: ${err}`);
      return;
    }

    const referencePos = this.bot.entity.position.offset(1, 0, 0);
    const refBlock = this.bot.blockAt(referencePos);
    if (!refBlock) {
      this.bot.chat("No reference block next to me to place the furnace onto.");
      return;
    }
    try {
      await this.bot.placeBlock(refBlock, new Vec3(0, 1, 0));
      this.bot.chat("Furnace placed.");
    } catch (err) {
      this.bot.chat(`Error placing furnace: ${err}`);
    }
  }

  private findNearbyFurnace(maxDistance: number) {
    const furnacePositions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block) => block && block.name === "furnace",
      maxDistance,
      count: 1,
    });
    if (furnacePositions.length === 0) return null;
    const pos = furnacePositions[0];
    return this.bot.blockAt(pos);
  }

  private async addFuelToFurnace(): Promise<boolean> {
    const window = this.bot.currentWindow;
    if (!window) {
      this.bot.chat("No furnace window open to add fuel.");
      return false;
    }

    const possibleFuels = [
      "coal",
      "charcoal",
      "oak_log",
      "spruce_log",
      "birch_log",
      "planks",
    ];
    for (const fuelName of possibleFuels) {
      const fuelItem = this.bot.inventory
        .items()
        .find((it) => it.name.includes(fuelName));
      if (fuelItem) {
        try {
          await this.bot.moveSlotItem(fuelItem.slot, 1);
          this.bot.chat(`Added ${fuelItem.count} of ${fuelItem.name} as fuel.`);
          return true;
        } catch (err) {
          this.bot.chat(
            `Failed to move fuel item ${fuelItem.name} into furnace: ${err}`
          );
          return false;
        }
      }
    }
    this.bot.chat("No valid fuel found in inventory.");
    return false;
  }

  private moveItemToFurnaceInput(inputItemName: string, count: number): number {
    const window = this.bot.currentWindow;
    if (!window) return 0;

    let remaining = count;
    const matchingItems = this.bot.inventory
      .items()
      .filter((it) => it.name.includes(inputItemName));

    for (const item of matchingItems) {
      const moveCount = Math.min(remaining, item.count);
      try {
        this.bot.moveSlotItem(item.slot, 0);
        remaining -= moveCount;
        if (remaining <= 0) break;
      } catch (err) {
        this.bot.chat(
          `Error transferring item "${item.name}" to furnace input: ${err}`
        );
      }
    }
    return count - remaining;
  }

  async plantCrop(cropName: string): Promise<void> {
    this.bot.chat(`Attempting to plant ${cropName}...`);
    const seedItem = this.bot.inventory
      .items()
      .find((it) => it.name === cropName);
    if (!seedItem) {
      this.bot.chat(`No seeds (${cropName}) found in inventory.`);
      return;
    }

    const referencePos = this.bot.entity.position.offset(0, -1, 1);
    const blockBeneath = this.bot.blockAt(referencePos);
    if (!blockBeneath || blockBeneath.name !== "farmland") {
      this.bot.chat("No farmland in front of me to plant seeds.");
      return;
    }

    try {
      await this.bot.equip(seedItem, "hand");
      await this.bot.placeBlock(blockBeneath, new Vec3(0, 1, 0));
      this.bot.chat(`${cropName} planted successfully!`);
    } catch (err) {
      this.bot.chat(`Error planting crop: ${err}`);
    }
  }

  async harvestCrop(cropName: string): Promise<void> {
    this.bot.chat(`Looking for fully grown ${cropName} to harvest...`);
    const blockPositions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block) => block && block.name.includes(cropName),
      maxDistance: 10,
      count: 1,
    });
    if (blockPositions.length === 0) {
      this.bot.chat(`No ${cropName} found nearby to harvest.`);
      return;
    }
    const pos = blockPositions[0];
    const block = this.bot.blockAt(pos);
    if (!block) {
      this.bot.chat("Could not resolve crop block at found position.");
      return;
    }

    await this.equipBestToolForBlock(block.name);
    await this.navigation.move(pos.x, pos.y, pos.z);
    try {
      await this.bot.dig(block);
      this.bot.chat(`${cropName} harvested!`);
    } catch (err) {
      this.bot.chat(`Error harvesting crop: ${err}`);
    }
  }

  /**
   * Equips the best tool for the given block name.
   */
  async equipBestToolForBlock(blockName: string): Promise<void> {
    let toolCategory: "pickaxe" | "axe" | "shovel" | "hoe" | null = null;
    if (blockName.includes("ore") || blockName.includes("stone")) {
      toolCategory = "pickaxe";
    } else if (blockName.includes("log") || blockName.includes("wood")) {
      toolCategory = "axe";
    } else if (
      blockName.includes("dirt") ||
      blockName.includes("sand") ||
      blockName.includes("gravel")
    ) {
      toolCategory = "shovel";
    } else if (blockName.includes("crop") || blockName.includes("farm")) {
      toolCategory = "hoe";
    }

    if (!toolCategory) return;
    const possibleToolNames = [
      `${toolCategory}`,
      `wooden_${toolCategory}`,
      `stone_${toolCategory}`,
      `iron_${toolCategory}`,
      `diamond_${toolCategory}`,
      `netherite_${toolCategory}`,
    ];
    for (const toolName of possibleToolNames) {
      const toolItem = this.bot.inventory
        .items()
        .find((it) => it.name.includes(toolName));
      if (toolItem) {
        try {
          await this.bot.equip(toolItem, "hand");
          this.bot.chat(`Equipped ${toolItem.name} for ${blockName}`);
          return;
        } catch (err) {
          this.bot.chat(`Failed to equip tool ${toolItem.name}: ${err}`);
        }
      }
    }
  }

  /**
   * Basic inventory sort (example approach).
   */
  async sortInventory(): Promise<void> {
    this.bot.chat("Sorting inventory...");
    const items = this.bot.inventory.items();
    const sorted = [...items].sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return b.count - a.count;
    });

    for (let i = 0; i < sorted.length; i++) {
      const targetSlot = this.bot.inventory.inventoryStart + i;
      const currentItem = this.bot.inventory.slots[targetSlot];
      const sortedItem = sorted[i];
      if (
        !currentItem ||
        currentItem.type !== sortedItem.type ||
        currentItem.count !== sortedItem.count
      ) {
        const itemSlot = sortedItem.slot;
        try {
          await this.bot.moveSlotItem(itemSlot, targetSlot);
        } catch (err) {
          this.bot.chat(`Error while sorting item ${sortedItem.name}: ${err}`);
        }
      }
    }
    this.bot.chat("Finished sorting inventory.");
  }

  async placeChest(): Promise<void> {
    this.sharedState.addPendingAction("Place Chest");

    let chestItem = this.bot.inventory
      .items()
      .find((it) => it.name.includes("chest"));
    if (!chestItem) {
      this.bot.chat("No chest in inventory; trying to craft a chest...");
      await this.craft("chest");
      chestItem = this.bot.inventory
        .items()
        .find((it) => it.name.includes("chest"));
      if (!chestItem) {
        this.bot.chat("Unable to obtain a chest.");
        return;
      }
    }

    try {
      await this.bot.equip(chestItem, "hand");
    } catch (err) {
      this.bot.chat(`Failed to equip chest: ${err}`);
      return;
    }

    const referencePos = this.bot.entity.position.offset(1, 0, 0);
    const refBlock = this.bot.blockAt(referencePos);
    if (!refBlock) {
      this.bot.chat("No reference block next to me to place the chest onto.");
      return;
    }

    try {
      await this.bot.placeBlock(refBlock, new Vec3(0, 1, 0));
      this.bot.chat("Chest placed.");
    } catch (err) {
      this.bot.chat(`Error placing chest: ${err}`);
    }
  }

  async storeItemInChest(itemName: string, count: number): Promise<void> {
    const chestBlock = this.findNearbyChest(3);
    if (!chestBlock) {
      this.bot.chat("No chest found nearby to store items.");
      return;
    }

    const chest = await this.bot.openChest(chestBlock);
    try {
      const toStore = this.bot.inventory
        .items()
        .find((it) => it.name.includes(itemName) && it.count > 0);
      if (!toStore) {
        this.bot.chat(`I have no "${itemName}" to store.`);
        chest.close();
        return;
      }
      const moveCount = Math.min(toStore.count, count);

      await chest.deposit(toStore.type, null, moveCount);
      this.bot.chat(`Stored ${moveCount} of ${itemName} into the chest.`);
    } catch (err) {
      this.bot.chat(`Error storing item: ${err}`);
    }
    chest.close();
  }

  async retrieveItemFromChest(itemName: string, count: number): Promise<void> {
    const chestBlock = this.findNearbyChest(3);
    if (!chestBlock) {
      this.bot.chat("No chest found nearby to retrieve items.");
      return;
    }

    const chest = await this.bot.openChest(chestBlock);
    try {
      const matchingItem = chest
        .containerItems()
        .find((it) => it.name.includes(itemName));
      if (!matchingItem) {
        this.bot.chat(`Chest does not contain "${itemName}".`);
        chest.close();
        return;
      }
      const moveCount = Math.min(matchingItem.count, count);

      await chest.withdraw(matchingItem.type, null, moveCount);
      this.bot.chat(`Withdrew ${moveCount} of ${itemName} from the chest.`);
    } catch (err) {
      this.bot.chat(`Error retrieving item: ${err}`);
    }
    chest.close();
  }

  private findNearbyChest(maxDistance: number) {
    const chestPositions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block) => block && block.name.includes("chest"),
      maxDistance,
      count: 1,
    });
    if (chestPositions.length === 0) return null;
    const pos = chestPositions[0];
    return this.bot.blockAt(pos);
  }

  /**
   * -----------------------
   * 3) Helper Methods
   * -----------------------
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private findSafePlacement(): Vec3 | null {
    this.bot.waitForChunksToLoad();
    const pos = this.bot.entity.position;
    const botBlockX = Math.floor(pos.x);
    const botBlockY = Math.floor(pos.y);
    const botBlockZ = Math.floor(pos.z);

    // Start searching outward from distance=2
    for (let d = 2; d <= 3; d++) {
      for (let yOffset = 0; yOffset <= 1; yOffset++) {
        const ring = this.getRingPositions(d);
        for (const offset of ring) {
          const candidate = pos.offset(offset.x, yOffset, offset.z);
          const candX = Math.floor(candidate.x);
          const candY = Math.floor(candidate.y);
          const candZ = Math.floor(candidate.z);

          // Skip if candidate is exactly where the bot stands or the block above it
          if (
            (candX === botBlockX &&
              candY === botBlockY &&
              candZ === botBlockZ) ||
            (candX === botBlockX &&
              candY === botBlockY + 1 &&
              candZ === botBlockZ)
          ) {
            continue;
          }

          const block = this.bot.blockAt(candidate);
          if (block && block.name === "air" && this.bot.canSeeBlock(block)) {
            return candidate;
          }
        }
      }
    }
    return null;
  }

  private getRingPositions(distance: number): Vec3[] {
    const positions: Vec3[] = [];
    for (let dx = -distance; dx <= distance; dx++) {
      for (let dz = -distance; dz <= distance; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) === distance) {
          positions.push(new Vec3(dx, 0, dz));
        }
      }
    }
    return positions;
  }
}