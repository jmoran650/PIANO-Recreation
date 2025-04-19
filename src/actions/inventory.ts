// src/actions/InventoryService.ts
import dotenv from 'dotenv';
import minecraftData from 'minecraft-data'; // Useful for item type lookups if needed
import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { SharedAgentState } from '../sharedAgentState'; // Included for consistency

dotenv.config();


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
   * NOTE: This is a basic example sort, behavior preserved exactly.
   * It might be inefficient or have issues with item stacking/NBT.
   */
  async sortInventory(): Promise<void> {
    console.log('[InventoryService] Sorting inventory...');
    // this.sharedState.addPendingAction("Sort Inventory"); // Add if desired

    const items = this.bot.inventory.items(); // Get current items

    // Sort criteria: name ascending, then count descending (Original Logic)
    const sorted = [...items].sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return b.count - a.count; // Higher count first for same item name
    });

    // Attempt to move items to sorted positions
    // WARNING: This is a naive sort and likely doesn't handle partial stacks,
    // NBT data correctly, or optimize moves. Preserving original logic.
    for (let i = 0; i < sorted.length; i++) {
      // Calculate target slot index in main inventory area
      const targetSlot = this.bot.inventory.inventoryStart + i;

      // Get item currently in the target slot
      const currentItemInTargetSlot = this.bot.inventory.slots[targetSlot];
      // Get the item that *should* be in this slot based on sort
      const desiredItemForSlot = sorted[i];

      // Check if the item is already in the correct place
      // This check compares type and count, might not be sufficient for NBT items.
      if (
        !currentItemInTargetSlot || // Slot is empty
        currentItemInTargetSlot.type !== desiredItemForSlot.type ||
        currentItemInTargetSlot.count !== desiredItemForSlot.count
        // Add NBT comparison here if needed:
        // || JSON.stringify(currentItemInTargetSlot.nbt) !== JSON.stringify(desiredItemForSlot.nbt)
      ) {
        // Item is not in the correct place, find where it currently is
        const sourceSlot = desiredItemForSlot.slot;

        // Check if source and target are the same (shouldn't happen with check above, but safe)
        if (sourceSlot === targetSlot) continue;

        console.log(`[InventoryService] Moving ${desiredItemForSlot.name} from slot ${sourceSlot} to ${targetSlot}`);
        try {
          // Attempt to move the item
          // NOTE: moveSlotItem moves the *entire* stack. This naive loop might
          // overwrite items or fail if slots aren't empty.
          // A real sort needs inventory transaction logic.
          await this.bot.moveSlotItem(sourceSlot, targetSlot);
          // Small delay might help avoid inventory desync issues?
          // await this.sleep(50); // Requires sleep helper if added
        } catch (err) {
          console.log(`[InventoryService] Error while sorting item ${desiredItemForSlot.name} (slot ${sourceSlot} to ${targetSlot}): ${err}`);
          // Continue trying to sort other items? Or stop? Original continued.
        }
      }
    }
    console.log('[InventoryService] Finished sorting attempt.');
  }

  /**
   * Stores a specified quantity of an item into a nearby chest.
   */
  async storeItemInChest(itemName: string, count: number): Promise<void> {
    // this.sharedState.addPendingAction(`Store ${itemName} x${count}`); // Add if desired
    const chestBlock = this.findNearbyChest(3); // Use internal helper
    if (!chestBlock) {
      console.log('[InventoryService] No chest found nearby to store items.');
      return;
    }

     // Ensure bot is close enough? Original didn't check. Assume findNearbyChest(3) suffices.

    let chest: any = null; // Use 'any' for ChestWindow type consistency
    try {
        console.log(`[InventoryService] Opening chest at ${chestBlock.position}...`);
        chest = await this.bot.openChest(chestBlock);
    } catch(err) {
        console.error(`[InventoryService] Failed to open chest: ${err}`);
        return; // Cannot continue if chest doesn't open
    }

    try {
      // Find the item(s) to store in the bot's inventory
      // Original used includes(itemName) - matching exact name is safer.
      // Let's find *all* stacks matching the name.
       const itemData = this.mcData.itemsByName[itemName];
       if (!itemData) {
           console.log(`[InventoryService] Unknown item name to store: ${itemName}`);
           chest.close();
           return;
       }
       const itemsToStore = this.bot.inventory.items().filter(it => it.type === itemData.id);

      if (itemsToStore.length === 0) {
        console.log(`[InventoryService] I have no "${itemName}" in my inventory to store.`);
        chest.close();
        return;
      }

      // Deposit items up to the specified count
      const totalDeposited = 0;
      const depositPromises = [];

       // Use chest.deposit which handles finding space. Deposit from each stack.
       console.log(`[InventoryService] Attempting to deposit ${count} of ${itemName}...`);
       try {
          // chest.deposit handles finding items in inventory and depositing up to 'count'
          await chest.deposit(itemData.id, null, count);
          // Note: chest.deposit doesn't directly return the amount deposited easily.
          // We'd have to re-check inventory or chest contents to confirm exact amount.
          // For simplicity, assume it deposited *up to* count if possible.
          console.log(`[InventoryService] Deposit operation completed for up to ${count} ${itemName}.`);
          // Original log assumed success based on finding item: `Stored ${moveCount} of ${itemName}...`
          // Logging completion is more accurate here.
       } catch(depositErr) {
           console.error(`[InventoryService] Error during chest deposit for ${itemName}: ${depositErr}`);
           // Continue to close chest even if deposit fails partially/fully
       }

      // Original loop logic (less robust than chest.deposit):
      // let remainingToStore = count;
      // for (const itemStack of itemsToStore) {
      //     if (remainingToStore <= 0) break;
      //     const amountToDeposit = Math.min(itemStack.count, remainingToStore);
      //     depositPromises.push(chest.deposit(itemStack.type, null, amountToDeposit));
      //     remainingToStore -= amountToDeposit;
      //     totalDeposited += amountToDeposit; // Track deposited amount more accurately
      // }
      // await Promise.all(depositPromises);
      // console.log(`[InventoryService] Stored ${totalDeposited} of ${itemName} into the chest.`);

    } catch (err) {
      // Catch errors during the inventory interaction part
      console.log(`[InventoryService] Error interacting with inventory/chest: ${err}`);
    } finally {
        // Always try to close the chest window
        if (chest) {
            try {
                await chest.close();
                console.log('[InventoryService] Chest closed.');
            } catch (closeErr) {
                console.warn(`[InventoryService] Error closing chest: ${closeErr}`);
            }
        }
    }
  }

  /**
   * Retrieves a specified quantity of an item from a nearby chest.
   */
  async retrieveItemFromChest(itemName: string, count: number): Promise<void> {
     // this.sharedState.addPendingAction(`Retrieve ${itemName} x${count}`); // Add if desired
    const chestBlock = this.findNearbyChest(3); // Use internal helper
    if (!chestBlock) {
      console.log('[InventoryService] No chest found nearby to retrieve items.');
      return;
    }

    let chest: any = null;
     try {
        console.log(`[InventoryService] Opening chest at ${chestBlock.position}...`);
        chest = await this.bot.openChest(chestBlock);
    } catch(err) {
        console.error(`[InventoryService] Failed to open chest: ${err}`);
        return;
    }

    try {
        // Find item type ID
        const itemData = this.mcData.itemsByName[itemName];
        if (!itemData) {
            console.log(`[InventoryService] Unknown item name to retrieve: ${itemName}`);
            chest.close();
            return;
        }

      // Check if chest contains the item and withdraw
      // Use chest.withdraw which handles finding items in chest
       console.log(`[InventoryService] Attempting to withdraw ${count} of ${itemName}...`);
       try {
           await chest.withdraw(itemData.id, null, count);
           // Similar to deposit, withdraw doesn't easily return exact count.
           console.log(`[InventoryService] Withdraw operation completed for up to ${count} ${itemName}.`);
       } catch(withdrawErr) {
            console.error(`[InventoryService] Error during chest withdraw for ${itemName}: ${withdrawErr}`);
            // Check if it was because item not found? Error message might indicate.
             if (withdrawErr instanceof Error && withdrawErr.message.includes('doesn\'t have')) {
                 console.log(`[InventoryService] Chest does not contain enough "${itemName}".`);
             }
       }


      // Original logic (less robust):
      // const matchingItem = chest
      //   .containerItems() // Get items inside the chest container
      //   .find((it: any) => it.name.includes(itemName)); // Original used includes
      // if (!matchingItem) {
      //   console.log(`[InventoryService] Chest does not contain "${itemName}".`);
      //   chest.close();
      //   return;
      // }
      // const amountToWithdraw = Math.min(matchingItem.count, count);
      // await chest.withdraw(matchingItem.type, null, amountToWithdraw);
      // console.log(`[InventoryService] Withdrew ${amountToWithdraw} of ${itemName} from the chest.`);

    } catch (err) {
      console.log(`[InventoryService] Error interacting with inventory/chest: ${err}`);
    } finally {
        // Always try to close the chest window
        if (chest) {
            try {
                await chest.close();
                console.log('[InventoryService] Chest closed.');
            } catch (closeErr) {
                console.warn(`[InventoryService] Error closing chest: ${closeErr}`);
            }
        }
    }
  }

  /**
   * Finds a nearby chest block.
   */
  private findNearbyChest(maxDistance: number): Block | null {
    const chestPositions = this.bot.findBlocks({
      point: this.bot.entity.position,
      // Original used includes("chest") - find specific block name 'chest' or 'trapped_chest'
      matching: (block) => block && (block.name === 'chest' || block.name === 'trapped_chest'),
      maxDistance,
      count: 1, // Find the first one
    });
    if (chestPositions.length === 0) {
        // console.log(`[InventoryService] No chest found within ${maxDistance} blocks.`);
        return null;
    }
    const pos = chestPositions[0];
    return this.bot.blockAt(pos);
  }

  // /**
  //  * INCLUDED: Simple async sleep function (if needed by sortInventory).
  //  */
  // private sleep(ms: number): Promise<void> {
  //   return new Promise((resolve) => setTimeout(resolve, ms));
  // }
}