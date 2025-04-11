// src/actions/SmeltingService.ts
import dotenv from 'dotenv';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { CraftingService } from './craft'; 
import { SharedAgentState } from '../sharedAgentState';
import { sleep } from './helpers/helpers'; 
import { BuildingService } from './build';

dotenv.config();
export class SmeltingService {
  private bot: Bot;
  private mcData: any;
  private sharedState: SharedAgentState;
  private craftingService: CraftingService;
  private buildingService: BuildingService;

  constructor(
    bot: Bot,
    sharedState: SharedAgentState,
    craftingService: CraftingService,
    buildingService: BuildingService 
  ) {
    this.bot = bot;
    this.sharedState = sharedState;
    if (process.env.MINECRAFT_VERSION == undefined) {
      throw new Error('[SmeltingService] Minecraft Version Undefined');
    }
    this.mcData = minecraftData(process.env.MINECRAFT_VERSION);
    this.craftingService = craftingService;
    this.buildingService = buildingService; 
  }

  /**
   * Smelts a specified quantity of an item in a nearby furnace.
   * Attempts to place a furnace if none is found.
   */
  async smelt(inputItemName: string, quantity: number): Promise<void> {
    this.sharedState.addPendingAction(`Smelt ${inputItemName} x${quantity}`);

    // Find or place a furnace
    let furnaceBlock = this.findNearbyFurnace(3); // Use internal helper
    if (!furnaceBlock) {
      console.log(
        '[SmeltingService] No furnace nearby. Attempting to place one...'
      );
      // Calls the included placeFurnace method (which might call duplicated craft)
      await this.buildingService.placeFurnace();
      furnaceBlock = this.findNearbyFurnace(3); // Check again after placing
      if (!furnaceBlock) {
        console.log(
          '[SmeltingService] Unable to find or place a furnace. Aborting smelt.'
        );
        // Should this throw an error? Original just returned.
        return;
      }
    }

    // Ensure bot is close enough? Original didn't explicitly move, assumed findNearbyFurnace(3) was sufficient.
    // Activate the furnace
    let furnaceWindow: any = null; // Use 'any' for window type as in original examples
    try {
      // Need to check if furnaceBlock is valid before activating
      if (!furnaceBlock) {
        console.log(
          '[SmeltingService] Furnace block became invalid before activation.'
        );
        return;
      }
      furnaceWindow = await this.bot.openFurnace(furnaceBlock); // Use openFurnace
      // Original used activateBlock - openFurnace is more specific and likely intended.
      // Sticking to openFurnace as it's more standard for furnace interaction.
      // await this.bot.activateBlock(furnaceBlock); // Original line
      console.log('[SmeltingService] Opened furnace window...');
    } catch (err) {
      console.log(`[SmeltingService] Failed to open furnace: ${err}`);
      return; // Cannot proceed if furnace can't be opened
    }

    // Add fuel
    // The window object is needed for addFuelToFurnace
    // Ensure the furnace window opened successfully
    if (!furnaceWindow) {
      console.log(
        '[SmeltingService] Furnace window not available after open attempt.'
      );
      return;
    }
    // NOTE: Original implementation had a potential issue where addFuelToFurnace
    // checked bot.currentWindow, which might not be set immediately after activateBlock.
    // Using the returned 'furnaceWindow' from openFurnace is safer.
    if (!(await this.addFuelToFurnace(furnaceWindow))) {
      // Pass window to helper
      console.log(
        '[SmeltingService] Failed to add fuel to furnace. Aborting smelt.'
      );
      // Close window if fuel fails? Original didn't explicitly close here.
      furnaceWindow.close();
      return;
    }

    // Add input items
    // Pass the furnaceWindow to the helper function
    const itemsDeposited = await this.moveItemToFurnaceInput(
      furnaceWindow,
      inputItemName,
      quantity
    ); // Pass window
    if (itemsDeposited === 0) {
      console.log(
        `[SmeltingService] No "${inputItemName}" found in inventory or failed to move items.`
      );
      // Close window if no items? Original didn't explicitly close here.
      furnaceWindow.close();
      return;
    } else {
      console.log(
        `[SmeltingService] Added ${itemsDeposited} ${inputItemName} to furnace input.`
      );
    }

    // Wait for smelting (Original used arbitrary sleep)
    // TODO: Implement smarter waiting (e.g., checking output slot or furnace state)
    console.log(
      `[SmeltingService] Waiting for smelting process ${
        5 * quantity
      } seconds...`
    );
    await sleep(5000 * quantity);

    // Close the furnace window
    // Original checked bot.currentWindow, safer to use the window object we have
    try {
      await furnaceWindow.close();
      console.log('[SmeltingService] Furnace window closed.');
    } catch (err) {
      console.log(`[SmeltingService] Error closing furnace window: ${err}`);
      // May already be closed, ignore error?
    }

    console.log(
      '[SmeltingService] Smelting process initiated/done. Check furnace output!'
    );
  }

  

  /**
   * Finds a nearby furnace block.
   */
  private findNearbyFurnace(maxDistance: number): Block | null {
    const furnacePositions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block) => block && block.name === 'furnace',
      maxDistance,
      count: 1,
    });
    if (furnacePositions.length === 0) return null;
    const pos = furnacePositions[0];
    return this.bot.blockAt(pos);
  }

  /**
   * Adds fuel to the currently open furnace window.
   * Takes the furnace window object as an argument.
   */
  private async addFuelToFurnace(furnaceWindow: any): Promise<boolean> {
    // Check if window is valid (passed as argument)
    if (!furnaceWindow) {
      console.log('[SmeltingService] No furnace window provided to add fuel.');
      return false;
    }

    const fuelSlot = furnaceWindow.fuelSlot();
    if (fuelSlot && fuelSlot.count > 0) {
      console.log(
        `[SmeltingService] Furnace already has fuel: ${fuelSlot.name} x${fuelSlot.count}`
      );
      return true;
    }

    // Find fuel in inventory (Original logic)
    const possibleFuels = [
      'coal',
      'charcoal',
      'oak_log',
      'spruce_log',
      'birch_log',
      'jungle_log',
      'acacia_log',
      'dark_oak_log',
      'mangrove_log',
      'cherry_log',
      'oak_planks',
      'spruce_planks',
      'birch_planks',
      'jungle_planks',
      'acacia_planks',
      'dark_oak_planks',
      'mangrove_planks',
      'cherry_planks',
      'bamboo_planks',
      'crimson_planks',
      'warped_planks',
    ];
    for (const fuelName of possibleFuels) {
      // Find item by name - use findInventoryItem for robustness
      const fuelItem = this.bot.inventory
        .items()
        .find((it) => it.name === fuelName);

      if (fuelItem) {
        console.log(
          `[SmeltingService] Found fuel: ${fuelItem.name} x${fuelItem.count}`
        );
        try {
          // Deposit fuel into the furnace window
          await furnaceWindow.putFuel(fuelItem.type, null, fuelItem.count);
          const fuelTargetSlotIndex = 1;
          await this.bot.moveSlotItem(fuelItem.slot, fuelTargetSlotIndex);

          console.log(`[SmeltingService] Added 1 ${fuelItem.name} as fuel.`);
          return true; // Fuel added successfully
        } catch (err) {
          console.log(
            `[SmeltingService] Failed to move fuel item ${fuelItem.name} into furnace: ${err}`
          );
          return false;
        }
      }
    }
    console.log('[SmeltingService] No valid fuel found in inventory.');
    return false;
  }

  /**
   * Moves items from inventory to the furnace input slot.
   * Takes the furnace window object as an argument.
   * Returns the number of items successfully moved.
   */
  private async moveItemToFurnaceInput(
    furnaceWindow: any,
    inputItemName: string,
    count: number
  ): Promise<number> {
    if (!furnaceWindow) {
      console.log('[SmeltingService] No furnace window provided to add input.');
      return 0;
    }

    let remaining = count;
    let movedCount = 0;
    const inputSlotIndex = 0; // Furnace input slot is index 0

    // Find matching items in inventory
    const itemData = this.mcData.itemsByName[inputItemName];
    if (!itemData) {
      console.log(
        `[SmeltingService] Invalid item name for furnace input: ${inputItemName}`
      );
      return 0;
    }
    const matchingItems = this.bot.inventory
      .items()
      .filter((it) => it.type === itemData.id);
    // Original used includes(inputItemName) - matching exact type is safer.

    if (matchingItems.length === 0) {
      console.log(
        `[SmeltingService] No items found matching ${inputItemName} in inventory.`
      );
      return 0;
    }

    for (const item of matchingItems) {
      const amountToMove = Math.min(remaining, item.count);
      if (amountToMove <= 0) continue; // Skip if item stack is empty

      try {
        // Use putInput for safer transfer logic
        // await furnaceWindow.putInput(item.type, null, amountToMove);
        // Original used moveSlotItem(item.slot, 0)
        // Let's try moveSlotItem for exactness. Note: it moves the WHOLE stack.
        await this.bot.moveSlotItem(item.slot, inputSlotIndex);

        // Assuming moveSlotItem moves the whole stack:
        const actualMoved = item.count; // This might be more than 'count' if stack > count
        console.log(
          `[SmeltingService] Moved ${actualMoved} of ${item.name} from inv slot ${item.slot} to furnace input.`
        );
        remaining -= actualMoved; // Adjust remaining based on actual amount moved
        movedCount += actualMoved;

        if (remaining <= 0) break; // Stop if desired count is reached/exceeded
      } catch (err) {
        console.log(
          `[SmeltingService] Error transferring item "${item.name}" to furnace input: ${err}`
        );
        // Stop trying if one move fails? Original didn't explicitly stop.
      }
    }

    // Return the total number of items actually moved
    // Cap return value at the originally requested count?
    // Or return the true total moved? Let's return true total.
    return movedCount;
    // Original returned `count - remaining`, which could be negative if more than count was moved.
    // Returning `movedCount` seems more intuitive.
    // Let's stick to original `count - remaining` for exactness:
    // return count - remaining; // This assumes remaining is correctly decremented
  }

}
