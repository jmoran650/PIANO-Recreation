// src/actions/InventoryService.ts
import dotenv from 'dotenv';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
// Import the Chest type directly from mineflayer
import { Chest } from 'mineflayer'; // <<< Corrected Import
import { Block } from 'prismarine-block';
// WindowType might not be needed if Chest provides all necessary properties/methods
// import { Window as WindowType } from 'prismarine-windows';
import { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import { SharedAgentState } from '../sharedAgentState';

dotenv.config();

// No longer need the alias, using Chest directly from mineflayer
// type ChestWindow = WindowType;

export class InventoryService {
  private bot: Bot;
  private mcData: minecraftData.IndexedData;
  private sharedState: SharedAgentState;

  constructor(
    bot: Bot,
    sharedState: SharedAgentState
  ) {
    this.bot = bot;
    this.sharedState = sharedState;
    if (process.env.MINECRAFT_VERSION == undefined) {
      throw new Error('[InventoryService] Minecraft Version Undefined');
    }
    this.mcData = minecraftData(process.env.MINECRAFT_VERSION);
  }

  /**
   * Sorts the bot's main inventory contents (simple name/count sort).
   */
  async sortInventory(): Promise<void> {
    console.log('[InventoryService] Sorting inventory...');
    // this.sharedState.addPendingAction("Sort Inventory");

    const items: Item[] = this.bot.inventory.items();

    const sorted: Item[] = [...items].sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return b.count - a.count;
    });

    for (let i = 0; i < sorted.length; i++) {
      const targetSlot = this.bot.inventory.inventoryStart + i;
      const currentItemInTargetSlot = this.bot.inventory.slots[targetSlot];
      const desiredItemForSlot = sorted[i];

      if (
        currentItemInTargetSlot === null ||
        currentItemInTargetSlot.type !== desiredItemForSlot.type ||
        currentItemInTargetSlot.count !== desiredItemForSlot.count
      ) {
        const sourceSlot = desiredItemForSlot.slot;
        if (sourceSlot === targetSlot) continue;

        console.log(`[InventoryService] Moving ${desiredItemForSlot.name} from slot ${sourceSlot} to ${targetSlot}`);
        try {
          await this.bot.moveSlotItem(sourceSlot, targetSlot);
        } catch (err: unknown) {
          if (err instanceof Error) {
            console.log(`[InventoryService] Error while sorting item ${desiredItemForSlot.name} (slot ${sourceSlot} to ${targetSlot}): ${err.message}`);
          } else {
            console.log(`[InventoryService] An unknown error occurred while sorting item ${desiredItemForSlot.name} (slot ${sourceSlot} to ${targetSlot})`);
            console.error(err);
          }
        }
      }
    }
    console.log('[InventoryService] Finished sorting attempt.');
  }

  /**
   * Stores a specified quantity of an item into a nearby chest.
   */
  async storeItemInChest(itemName: string, count: number): Promise<void> {
    // this.sharedState.addPendingAction(`Store ${itemName} x${count}`);
    const chestBlock = this.findNearbyChest(3);
    if (!chestBlock) {
      console.log('[InventoryService] No chest found nearby to store items.');
      return;
    }

    let chest: Chest | null = null; // <<< Use Chest type
    try {
      console.log(`[InventoryService] Opening chest at ${chestBlock.position.toString()}...`);
      // bot.openChest returns Promise<Chest>
      chest = await this.bot.openChest(chestBlock);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`[InventoryService] Failed to open chest: ${err.message}`);
      } else {
        console.error('[InventoryService] Failed to open chest due to an unknown error.');
        console.error(err);
      }
      return;
    }

    try {
      const itemData = this.mcData.itemsByName[itemName];
      if (!itemData) {
        console.log(`[InventoryService] Unknown item name to store: ${itemName}`);
        // Ensure chest is not null before calling close
        if (chest) chest.close(); // <<< chest is now Chest type
        return;
      }
      const itemsToStore = this.bot.inventory.items().filter(it => it.type === itemData.id);

      if (itemsToStore.length === 0) {
        console.log(`[InventoryService] I have no "${itemName}" in my inventory to store.`);
        // Ensure chest is not null before calling close
        if (chest) chest.close(); // <<< chest is now Chest type
        return;
      }

      console.log(`[InventoryService] Attempting to deposit ${count} of ${itemName}...`);
      try {
         // Ensure chest is not null before calling deposit
         if (chest) {
            await chest.deposit(itemData.id, null, count); // <<< chest is now Chest type
            console.log(`[InventoryService] Deposit operation completed for up to ${count} ${itemName}.`);
         } else {
             console.error('[InventoryService] Cannot deposit, chest reference is null.');
         }
      } catch (depositErr: unknown) {
        if (depositErr instanceof Error) {
           console.error(`[InventoryService] Error during chest deposit for ${itemName}: ${depositErr.message}`);
        } else {
            console.error(`[InventoryService] An unknown error occurred during chest deposit for ${itemName}.`);
            console.error(depositErr);
        }
      }

    } catch (err: unknown) {
        if (err instanceof Error) {
            console.log(`[InventoryService] Error interacting with inventory/chest: ${err.message}`);
        } else {
            console.log('[InventoryService] An unknown error occurred interacting with inventory/chest.');
            console.error(err);
        }
    } finally {
      // Ensure chest is not null before calling close
      if (chest) {
        try {
          chest.close(); // <<< chest is now Chest type
          console.log('[InventoryService] Chest closed.');
        } catch (closeErr: unknown) {
            if (closeErr instanceof Error) {
                 console.warn(`[InventoryService] Error closing chest: ${closeErr.message}`);
            } else {
                 console.warn('[InventoryService] An unknown error occurred closing chest.');
                 console.error(closeErr);
            }
        }
      }
    }
  }

  /**
   * Retrieves a specified quantity of an item from a nearby chest.
   */
  async retrieveItemFromChest(itemName: string, count: number): Promise<void> {
    // this.sharedState.addPendingAction(`Retrieve ${itemName} x${count}`);
    const chestBlock = this.findNearbyChest(3);
    if (!chestBlock) {
      console.log('[InventoryService] No chest found nearby to retrieve items.');
      return;
    }

    let chest: Chest | null = null; // <<< Use Chest type
    try {
      console.log(`[InventoryService] Opening chest at ${chestBlock.position.toString()}...`);
       // bot.openChest returns Promise<Chest>
      chest = await this.bot.openChest(chestBlock);
    } catch (err: unknown) {
      if (err instanceof Error) {
         console.error(`[InventoryService] Failed to open chest: ${err.message}`);
      } else {
         console.error('[InventoryService] Failed to open chest due to an unknown error.');
         console.error(err);
      }
      return;
    }

    try {
      const itemData = this.mcData.itemsByName[itemName];
      if (!itemData) {
        console.log(`[InventoryService] Unknown item name to retrieve: ${itemName}`);
        // Ensure chest is not null before calling close
        if (chest) chest.close(); // <<< chest is now Chest type
        return;
      }

      console.log(`[InventoryService] Attempting to withdraw ${count} of ${itemName}...`);
      try {
          // Ensure chest is not null before calling withdraw
          if (chest) {
             await chest.withdraw(itemData.id, null, count); // <<< chest is now Chest type
             console.log(`[InventoryService] Withdraw operation completed for up to ${count} ${itemName}.`);
          } else {
              console.error('[InventoryService] Cannot withdraw, chest reference is null.');
          }
      } catch (withdrawErr: unknown) {
        if (withdrawErr instanceof Error) {
            console.error(`[InventoryService] Error during chest withdraw for ${itemName}: ${withdrawErr.message}`);
             if (withdrawErr.message.includes('doesn\'t have')) {
                 console.log(`[InventoryService] Chest does not contain enough "${itemName}".`);
             }
        } else {
             console.error(`[InventoryService] An unknown error occurred during chest withdraw for ${itemName}.`);
             console.error(withdrawErr);
        }
      }

    } catch (err: unknown) {
        if (err instanceof Error) {
            console.log(`[InventoryService] Error interacting with inventory/chest: ${err.message}`);
        } else {
            console.log('[InventoryService] An unknown error occurred interacting with inventory/chest.');
            console.error(err);
        }
    } finally {
       // Ensure chest is not null before calling close
      if (chest) {
        try {
          chest.close(); 
          console.log('[InventoryService] Chest closed.');
        } catch (closeErr: unknown) {
             if (closeErr instanceof Error) {
                console.warn(`[InventoryService] Error closing chest: ${closeErr.message}`);
            } else {
                console.warn('[InventoryService] An unknown error occurred closing chest.');
                console.error(closeErr);
            }
        }
      }
    }
  }

  /**
   * Finds a nearby chest block.
   */
  private findNearbyChest(maxDistance: number): Block | null {
    const chestPositions: Vec3[] = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block: Block): boolean => block !== null && (block.name === 'chest' || block.name === 'trapped_chest'),
      maxDistance,
      count: 1,
    });
    if (chestPositions.length === 0) {
      return null;
    }
    const pos: Vec3 = chestPositions[0];
    const block = this.bot.blockAt(pos);
    return block;
  }

  // /**
  //  * INCLUDED: Simple async sleep function (if needed by sortInventory).
  //  */
  // private sleep(ms: number): Promise<void> {
  //   return new Promise((resolve) => setTimeout(resolve, ms));
  // }
}