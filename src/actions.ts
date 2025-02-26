// src/actions.ts
import { Bot } from "mineflayer";
import { Navigation } from "./navigation";
import { Vec3 } from "vec3";
import minecraftData from "minecraft-data";
import { Block } from "prismarine-block";
import { SharedAgentState } from "./sharedAgentState";

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

  constructor(bot: Bot, navigation: Navigation, sharedState: SharedAgentState) {
    this.bot = bot;
    this.navigation = navigation;
    this.mcData = minecraftData("1.21.4");
    this.sharedState = sharedState;
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
      const blockPositions = this.bot.findBlocks({
        point: this.bot.entity.position,
        matching: (block) => block && block.name === goalBlock,
        maxDistance: 50,
        count: 1,
      });

      if (blockPositions.length === 0) {
        this.bot.chat(`No ${goalBlock} found nearby.`);
        break;
      }

      const blockPos = blockPositions[0];
      const block = this.bot.blockAt(blockPos);
      if (!block) continue;

      // Equip the best tool for this block.
      await this.equipBestToolForBlock(goalBlock);

      await this.navigation.move(blockPos.x, blockPos.y, blockPos.z);

      try {
        await this.bot.dig(block);
        count++;
        this.bot.chat(`Mined ${count} of ${desiredCount} ${goalBlock} blocks.`);
      } catch (err) {
        this.bot.chat(`Error mining block: ${err}`);
      }

      await this.sleep(500);
    }
  }
  /**
   * Crafts a goal item (if a recipe is available).
   */
  async craft(goalItem: string): Promise<void> {
    this.sharedState.addPendingAction(`Craft ${goalItem}`);

    const itemData = this.mcData.itemsByName[goalItem];
    if (!itemData) {
      this.bot.chat(`No item data found for ${goalItem}.`);
      return;
    }
    const itemId: number = itemData.id;

    const recipes = this.bot.recipesFor(itemId, null, 1, true);
    if (recipes.length === 0) {
      this.bot.chat(`No recipe found for ${goalItem}.`);
      return;
    }
    const recipe = recipes[0];

    try {
      if (recipe.requiresTable) {
        const tableResult = await this.ensureCraftingTableIfNeeded(recipe);
        if (typeof tableResult === "string") {
          // An error message was returned.
          this.bot.chat(tableResult);
          return;
        }
        // tableResult is a Vec3; get the block at that position.
        const tableBlock = this.bot.blockAt(tableResult);
        if (!tableBlock) {
          this.bot.chat(
            "Error: Crafting table block not found at returned position."
          );
          return;
        }
        await this.bot.craft(recipe, 1, tableBlock);
      } else {
        await this.bot.craft(recipe, 1);
      }
      this.bot.chat(`Crafted ${goalItem}.`);
    } catch (err) {
      this.bot.chat(`Couldn't craft ${goalItem}: ${err}`);
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

    // Explicit plugin check: ensure mineflayer-pvp is loaded.
    const pvp = (this.bot as any).pvp;
    if (!pvp) {
      const errorMsg =
        "Error: mineflayer-pvp plugin not loaded. Attack action disabled.";
      this.bot.chat(errorMsg);
      // Throwing an error makes it clear to any caller (or LLM) that this action is unavailable.
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

    const target = mobs[0];
    this.bot.chat(`Attacking the nearest ${mobType}...`);
    try {
      if (typeof pvp.attack === "function") {
        pvp.attack(target);
        this.bot.once("stoppedAttacking", () => {
          this.bot.chat("Target has been killed!");
        });
      } else {
        this.bot.chat("pvp.attack is not a function. Plugin mismatch?");
      }
    } catch (err: unknown) {
      let errMsg: string = err instanceof Error ? err.message : String(err);
      this.bot.chat(`Error while attacking ${mobType}: ${errMsg}`);
    }
  }

  /**
   * Places a crafting table at a safe nearby position.
   */
  async placeCraftingTable(): Promise<void> {
    this.sharedState.addPendingAction("Place Crafting Table");

    const table = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName.crafting_table.id,
      null,
      false
    );
    if (!table) {
      this.bot.chat("I don't have a crafting table!");
      return;
    }

    const safePos = this.findSafePlacement();
    if (!safePos) {
      this.bot.chat("No valid spot to place the crafting table!");
      return;
    }

    try {
      await this.bot.lookAt(safePos.offset(0.5, 0.5, 0.5));
      const referenceBlock = this.bot.blockAt(safePos.offset(0, -1, 0));
      if (!referenceBlock) {
        this.bot.chat("No block found to place the crafting table on.");
        return;
      }
      await this.bot.equip(table, "hand");
      await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      this.bot.chat("Crafting table placed!");
    } catch (err) {
      this.bot.chat(
        "Failed to place crafting table: " +
          (err instanceof Error ? err.message : err)
      );
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
   * 2) New Methods
   * -----------------------
   * These implementations are simplified placeholders demonstrating
   * potential approaches to smelting, farming, tool management, inventory
   * management, and chest interaction. Production code often needs more
   * robust logic and error-handling.
   */

  /**
   * 2a) Smelting & Furnace Interaction
   * Attempts to smelt a given item (e.g., "iron_ore") into its smelted product.
   */
  async smelt(inputItemName: string, quantity: number): Promise<void> {
    this.sharedState.addPendingAction(`Smelt ${inputItemName} x${quantity}`);

    // 1) Ensure we have a furnace placed or place one.
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

    // 2) Equip item to open furnace GUI
    try {
      await this.bot.activateBlock(furnaceBlock);
      this.bot.chat("Opened furnace...");
    } catch (err) {
      this.bot.chat("Failed to open furnace: " + err);
      return;
    }

    // 3) Insert fuel
    if (!(await this.addFuelToFurnace())) {
      this.bot.chat("Failed to add fuel to furnace. Aborting smelt.");
      return;
    }

    // 4) Insert the input items into the top slot
    const neededCount = this.moveItemToFurnaceInput(inputItemName, quantity);
    if (neededCount === 0) {
      this.bot.chat(`No "${inputItemName}" found to smelt!`);
      return;
    } else {
      this.bot.chat(`Smelting up to ${neededCount} ${inputItemName}...`);
    }

    // 5) Wait for smelting to complete, or at least partially complete.
    await this.sleep(5000);
    // Fix: Only call closeWindow if currentWindow exists.
    if (this.bot.currentWindow) {
      this.bot.closeWindow(this.bot.currentWindow);
    }
    this.bot.chat(
      `Smelting process done or in progress. Check furnace or inventory!`
    );
  }

  /**
   * Place a furnace from the bot's inventory if not currently found.
   */
  private async placeFurnace(): Promise<void> {
    let furnaceItem = this.bot.inventory
      .items()
      .find((item) => item.name === "furnace");
    if (!furnaceItem) {
      this.bot.chat("No furnace item in inventory; attempting to craft...");
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

  /**
   * Looks for a furnace block within `maxDistance` blocks of the bot.
   */
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

  /**
   * Adds fuel to the furnace's fuel slot if the furnace window is open.
   */
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
          // Furnace fuel slot is typically index 1 in the furnace window.
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

  /**
   * Moves up to `count` items matching `inputItemName` into the top furnace slot (index 0).
   * Returns the actual amount moved (up to `count`).
   */
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
        // Fix: Remove third argument as moveSlotItem expects only two arguments.
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

  /**
   * 2b) Fuel Management
   * (Additional fuel management logic could be added here.)
   */

  /**
   * 2c) Farming & Resource Renewal
   */
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
   * 2d) Tool & Equipment Management
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
      `stone_${toolCategory}`,
      `iron_${toolCategory}`,
      `diamond_${toolCategory}`,
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
   * 2e) Inventory Management & Storage
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
    this.bot.chat("Finished sorting inventory (simple approach).");
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
    const pos = this.bot.entity.position;
    // Determine the block coordinates the bot currently occupies
    const botBlockX = Math.floor(pos.x);
    const botBlockY = Math.floor(pos.y);
    const botBlockZ = Math.floor(pos.z);

    // Start the search at a minimum distance of 2
    for (let d = 2; d <= 3; d++) {
      for (let yOffset = 0; yOffset <= 1; yOffset++) {
        const ring = this.getRingPositions(d);
        for (const offset of ring) {
          const candidate = pos.offset(offset.x, yOffset, offset.z);
          // Compute candidate's block coordinates.
          const candX = Math.floor(candidate.x);
          const candY = Math.floor(candidate.y);
          const candZ = Math.floor(candidate.z);
          // Skip if candidate is in the block the bot occupies or directly above it.
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
          if (block && block.name === "air") {
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

  /**
   * Updated ensureCraftingTableIfNeeded
   *
   * Returns either the coordinates (Vec3) of a nearby crafting table or one that has just been placed,
   * or a string message if no crafting table is available (or could be crafted).
   */
  private async ensureCraftingTableIfNeeded(
    recipe: any
  ): Promise<Vec3 | string> {
    if (recipe.requiresTable) {
      // Try to find a nearby crafting table.
      const positions = this.bot.findBlocks({
        point: this.bot.entity.position,
        matching: (block: any) => block && block.name === "crafting_table",
        maxDistance: 4.4,
        count: 1,
      });
      if (positions.length > 0) {
        const tableBlock = this.bot.blockAt(positions[0]);
        if (tableBlock) {
          return tableBlock.position;
        }
      }
      // No nearby table. Check if the bot has a crafting table in inventory.
      let tableItem = this.bot.inventory
        .items()
        .find((item) => item.name === "crafting_table");
      if (tableItem) {
        // Place the table from inventory.
        await this.placeCraftingTable();
        const newPositions = this.bot.findBlocks({
          point: this.bot.entity.position,
          matching: (block: any) => block && block.name === "crafting_table",
          maxDistance: 4.4,
          count: 1,
        });
        if (newPositions.length > 0) {
          const newTableBlock = this.bot.blockAt(newPositions[0]);
          if (newTableBlock) {
            return newTableBlock.position;
          }
        }
      } else {
        // Bot does not have a crafting table item; attempt to craft one.
        await this.craft("crafting_table");
        tableItem = this.bot.inventory
          .items()
          .find((item) => item.name === "crafting_table");
        if (tableItem) {
          await this.placeCraftingTable();
          const newPositions = this.bot.findBlocks({
            point: this.bot.entity.position,
            matching: (block: any) => block && block.name === "crafting_table",
            maxDistance: 4.4,
            count: 1,
          });
          if (newPositions.length > 0) {
            const newTableBlock = this.bot.blockAt(newPositions[0]);
            if (newTableBlock) {
              return newTableBlock.position;
            }
          }
        }
      }
      return "No crafting table nearby or in inventory, and one could not be crafted.";
    }
    return "No crafting table required.";
  }
}
