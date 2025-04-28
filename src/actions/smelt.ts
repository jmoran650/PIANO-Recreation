import dotenv from 'dotenv';
import minecraftData from 'minecraft-data';
import { Bot, FurnaceWindow } from 'mineflayer'; // Keep FurnaceWindow import
import { Block } from 'prismarine-block';
import { CraftingService } from './craft';
import { SharedAgentState } from '../sharedAgentState';
import { sleep } from './helpers/helpers';
import { BuildingService } from './build';


dotenv.config();
export class SmeltingService {
  private bot: Bot;
  private mcData: minecraftData.IndexedData;
  private sharedState: SharedAgentState;
  private buildingService: BuildingService;
  private craftingService: CraftingService;
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





  async smelt(inputItemName: string, quantity: number): Promise<void> {
    this.sharedState.addPendingAction(`Smelt ${inputItemName} x${quantity}`);


    let furnaceBlock = this.findNearbyFurnace(30);
    if (!furnaceBlock) {
      console.log(
        '[SmeltingService] No furnace nearby. Attempting to place one...'
      );
      await this.buildingService.placeFurnace();
      furnaceBlock = this.findNearbyFurnace(30);
      if (!furnaceBlock) {
        console.log(
          '[SmeltingService] Unable to find or place a furnace. Aborting smelt.'
        );

        return;
      }
    }


    let furnaceWindow: FurnaceWindow | null = null;
    try {

      if (!furnaceBlock) {
        console.log(
          '[SmeltingService] Furnace block became invalid before activation.'
        );
        return;
      }
      // Use double cast to handle the type mismatch between Furnace and FurnaceWindow
      furnaceWindow = (await this.bot.openFurnace(furnaceBlock)) as unknown as FurnaceWindow;
      console.log('[SmeltingService] Opened furnace window...');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[SmeltingService] Failed to open furnace: ${msg}`);
      return;
    }




    if (!furnaceWindow) {
      console.log(
        '[SmeltingService] Furnace window not available after open attempt.'
      );
      return;
    }



    if (!(await this.addFuelToFurnace(furnaceWindow))) {

      console.log(
        '[SmeltingService] Failed to add fuel to furnace. Aborting smelt.'
      );

      furnaceWindow.close(); // Now TS should find close()
      return;
    }



    const itemsDeposited = await this.moveItemToFurnaceInput(
      furnaceWindow,
      inputItemName,
      quantity
    );
    if (itemsDeposited === 0) {
      console.log(
        `[SmeltingService] No "${inputItemName}" found in inventory or failed to move items.`
      );

      furnaceWindow.close(); // Now TS should find close()
      return;
    } else {
      console.log(
        `[SmeltingService] Added ${itemsDeposited} ${inputItemName} to furnace input.`
      );
    }



    console.log(
      `[SmeltingService] Waiting for smelting process ${
        5 * quantity
      } seconds...`
    );
    await sleep(5000 * quantity);



    try {
      furnaceWindow.close(); // Now TS should find close()
      console.log('[SmeltingService] Furnace window closed.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[SmeltingService] Error closing furnace window: ${msg}`);

    }

    console.log(
      '[SmeltingService] Smelting process initiated/done. Check furnace output!'
    );
  }






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





  private async addFuelToFurnace(furnaceWindow: FurnaceWindow): Promise<boolean> {

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

      const fuelItem = this.bot.inventory
        .items()
        .find((it) => it.name === fuelName);

      if (fuelItem) {
        console.log(
          `[SmeltingService] Found fuel: ${fuelItem.name} x${fuelItem.count}`
        );
        try {

          await furnaceWindow.putFuel(fuelItem.type, null, 1); // Use 1 assuming putFuel only moves one at a time like this
          console.log(`[SmeltingService] Added 1 ${fuelItem.name} as fuel.`);
          return true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(
            `[SmeltingService] Failed to put fuel item ${fuelItem.name} into furnace: ${msg}`
          );
          // Don't return false here, try the next fuel type
        }
      }
    }
    console.log('[SmeltingService] No valid fuel found in inventory.');
    return false; // Return false only after checking all possible fuels
  }






  private async moveItemToFurnaceInput(
    furnaceWindow: FurnaceWindow,
    inputItemName: string,
    count: number
  ): Promise<number> {
    if (!furnaceWindow) {
      console.log('[SmeltingService] No furnace window provided to add input.');
      return 0;
    }

    let remaining = count;
    let movedCount = 0;


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


    if (matchingItems.length === 0) {
      console.log(
        `[SmeltingService] No items found matching ${inputItemName} in inventory.`
      );
      return 0;
    }

    for (const item of matchingItems) {
      const amountToMove = Math.min(remaining, item.count);
      if (amountToMove <= 0) continue;

      try {
        await furnaceWindow.putInput(item.type, null, amountToMove);

        const actualMoved = amountToMove; // Assume putInput moves the requested amount
        console.log(
          `[SmeltingService] Put ${actualMoved} of ${item.name} from inv slot ${item.slot} into furnace input.`
        );
        remaining -= actualMoved;
        movedCount += actualMoved;

        if (remaining <= 0) break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          `[SmeltingService] Error putting item "${item.name}" to furnace input: ${msg}`
        );
        // Break the loop on error to avoid potential infinite loops if the error persists
        break;
      }
    }
    return movedCount;
  }

}