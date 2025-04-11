// ==================================================
// File: src/actions/build.ts (Modified)
// ==================================================
import dotenv from 'dotenv';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';
import { SharedAgentState } from '../sharedAgentState';
import {
  checkPlacementPossible,
  findSafePlacement,
  sleep,
} from './helpers/helpers'; // Keep sleep if used by other methods

dotenv.config();

export class BuildingService {
  private bot: Bot;
  private sharedState: SharedAgentState;
  private mcData: any;

  constructor(
    bot: Bot,
    sharedState: SharedAgentState
    // BuildingService is no longer needed by CraftingService for table placement
  ) {
    this.bot = bot;
    this.sharedState = sharedState;

    const version = process.env.MINECRAFT_VERSION || bot.version;
    if (!version) {
      throw new Error(
        '[BuildingService] Minecraft Version Undefined and not available from bot'
      );
    }
    this.mcData = minecraftData(version);
    if (!this.mcData) {
      throw new Error(
        `[BuildingService] Failed to load minecraft-data for version ${version}`
      );
    }
  }

  async placeFurnace(): Promise<Block> {
    this.sharedState.addPendingAction('Place Furnace');
    console.log('[BuildingService] Attempting to place furnace.');
    const furnaceItem = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName.furnace.id,
      null,
      false
    );

    if (!furnaceItem) {
      throw new Error(
        '[BuildingService] Furnace not found in inventory. Caller must ensure it is crafted first.'
      );
    }

    try {
      await this.bot.equip(furnaceItem, 'hand');
      console.log('[BuildingService] Equipped furnace.');
    } catch (err: any) {
      throw new Error(
        `[BuildingService] Failed to equip furnace: ${err.message || err}`
      );
    }

    const safePos = findSafePlacement(this.bot);
    if (!safePos) {
      throw new Error(
        '[BuildingService] No suitable safe position found to place the furnace.'
      );
    }

    const referenceBlock = this.bot.blockAt(safePos.offset(0, -1, 0));

    if (
      !referenceBlock ||
      !checkPlacementPossible(this.bot, this.mcData, safePos, referenceBlock)
    ) {
      const reason = !referenceBlock
        ? 'Reference block missing'
        : `Placement check failed on ref block '${referenceBlock.name}'`;
      throw new Error(
        `[BuildingService] Cannot place furnace at ${safePos}: ${reason}.`
      );
    }

    console.log(
      `[BuildingService] Attempting to place furnace at ${safePos} onto block ${referenceBlock.name} at ${referenceBlock.position}`
    );

    try {
      await this.bot.lookAt(safePos.offset(0.5, 0.5, 0.5), true);
      await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      await sleep(100); // Brief wait for block update consistency

      const placedBlock = this.bot.blockAt(safePos);
      if (placedBlock?.name === 'furnace') {
        console.log(
          `[BuildingService] Furnace placed successfully at ${safePos}.`
        );
        // Optionally add to shared state if furnace positions are tracked
        // this.sharedState.addFurnacePosition(safePos);
        return placedBlock;
      } else {
        throw new Error(
          `[BuildingService] Placed block at ${safePos}, but it is not a furnace (found ${placedBlock?.name}).`
        );
      }
    } catch (err: any) {
      console.error(
        `[BuildingService] Error placing furnace: ${err.message || err}`
      );
      throw new Error(`Error placing furnace: ${err.message || err}`);
    }
  }

  async placeChest(): Promise<Block> {
    this.sharedState.addPendingAction('Place Chest');
    console.log('[BuildingService] Attempting to place chest.');
    const chestItem = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName.chest.id,
      null,
      false
    );

    if (!chestItem) {
      throw new Error(
        '[BuildingService] Chest not found in inventory. Caller must ensure it is crafted first.'
      );
    }

    try {
      await this.bot.equip(chestItem, 'hand');
      console.log('[BuildingService] Equipped chest.');
    } catch (err: any) {
      throw new Error(
        `[BuildingService] Failed to equip chest: ${err.message || err}`
      );
    }

    const safePos = findSafePlacement(this.bot);
    if (!safePos) {
      throw new Error(
        '[BuildingService] No suitable safe position found to place the chest.'
      );
    }

    const referenceBlock = this.bot.blockAt(safePos.offset(0, -1, 0));
    if (
      !referenceBlock ||
      !checkPlacementPossible(this.bot, this.mcData, safePos, referenceBlock)
    ) {
      const reason = !referenceBlock
        ? 'Reference block missing'
        : `Placement check failed on ref block '${referenceBlock.name}'`;
      throw new Error(
        `[BuildingService] Cannot place chest at ${safePos}: ${reason}.`
      );
    }

    console.log(
      `[BuildingService] Attempting to place chest at ${safePos} onto block ${referenceBlock.name} at ${referenceBlock.position}`
    );

    try {
      await this.bot.lookAt(safePos.offset(0.5, 0.5, 0.5), true);
      await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      await sleep(100); // Brief wait

      const placedBlock = this.bot.blockAt(safePos);
      if (
        placedBlock?.name === 'chest' ||
        placedBlock?.name === 'trapped_chest'
      ) {
        // Account for trapped chests if applicable
        console.log(
          `[BuildingService] Chest placed successfully at ${safePos}.`
        );
        // Optionally add to shared state if chest positions are tracked
        // this.sharedState.addChestPosition(safePos);
        return placedBlock;
      } else {
        throw new Error(
          `[BuildingService] Placed block at ${safePos}, but it is not a chest (found ${placedBlock?.name}).`
        );
      }
    } catch (err: any) {
      console.error(
        `[BuildingService] Error placing chest: ${err.message || err}`
      );
      throw new Error(`Error placing chest: ${err.message || err}`);
    }
  }

  async placeBlock(blockType: string): Promise<Block> {
    this.sharedState.addPendingAction(`Place ${blockType}`);
    console.log(`[BuildingService] Attempting to place ${blockType}.`);

    const blockItemData = this.mcData.itemsByName[blockType];
    if (!blockItemData) {
      throw new Error(
        `[BuildingService] Unknown block/item type: ${blockType}`
      );
    }

    const blockItem = this.bot.inventory.findInventoryItem(
      blockItemData.id,
      null,
      false
    );
    if (!blockItem) {
      throw new Error(
        `[BuildingService] ${blockType} not found in inventory. Caller must ensure it is obtained first.`
      );
    }

    try {
      await this.bot.equip(blockItem, 'hand');
      console.log(`[BuildingService] Equipped ${blockType}.`);
    } catch (err: any) {
      throw new Error(
        `[BuildingService] Failed to equip ${blockType}: ${err.message || err}`
      );
    }

    const safePos = findSafePlacement(this.bot);
    if (!safePos) {
      throw new Error(
        `[BuildingService] No suitable safe position found to place ${blockType}.`
      );
    }

    const referenceBlock = this.bot.blockAt(safePos.offset(0, -1, 0));
    if (
      !referenceBlock ||
      !checkPlacementPossible(this.bot, this.mcData, safePos, referenceBlock)
    ) {
      const reason = !referenceBlock
        ? 'Reference block missing'
        : `Placement check failed on ref block '${referenceBlock.name}'`;
      throw new Error(
        `[BuildingService] Cannot place ${blockType} at ${safePos}: ${reason}.`
      );
    }

    console.log(
      `[BuildingService] Attempting to place ${blockType} at ${safePos} onto block ${referenceBlock.name} at ${referenceBlock.position}`
    );

    try {
      await this.bot.lookAt(safePos.offset(0.5, 0.5, 0.5), true);
      await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      await sleep(100); // Brief wait

      const placedBlock = this.bot.blockAt(safePos); // placedBlock is Block | null

      // Check if placed block name matches the *block* name, which might differ slightly from item name
      const expectedBlockName =
        this.mcData.blocksByName[blockType]?.name || blockType;

      if (placedBlock) {
        // Check if placedBlock is not null
        if (placedBlock.name === expectedBlockName) {
          console.log(
            `[BuildingService] Placed ${blockType} successfully at ${safePos}.`
          );
          if (placedBlock?.name === 'crafting_table') {
            console.log(`[BuildingService] Internal placement: BuildingService placeBlock was used to place a crafting table at ${safePos}!`);
            this.sharedState.addCraftingTablePosition(safePos);
          }
          return placedBlock; 
          
        } else {
          console.warn(
            `[BuildingService] Placed block at ${safePos}, but expected ${expectedBlockName} and found ${placedBlock.name}. Returning found block.`
          );
          // Return the unexpected block type, it's still a valid Block
          return placedBlock;
        }
      } else {
        // If placedBlock is null after placement, something went wrong.
        console.error(
          `[BuildingService] Error placing ${blockType}: Block at target position ${safePos} is null after placement attempt.`
        );
        throw new Error(
          `Failed to place ${blockType}: Block not found at target location after placement.`
        );
      }
    } catch (err: any) {
      console.error(
        `[BuildingService] Error placing ${blockType}: ${err.message || err}`
      );
      throw new Error(`Error placing ${blockType}: ${err.message || err}`); // Re-throw original or new error
    }
  }
}
