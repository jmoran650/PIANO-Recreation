// src/actions/mine.ts
import dotenv from 'dotenv';

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
// Import Entity and Item types based on the provided definitions
import { Entity } from 'prismarine-entity';
import { Item } from 'prismarine-item';

import { blockDropMapping } from '../../data/minecraftItems';
import { Navigation } from '../navigation';

import { SharedAgentState } from '../sharedAgentState';
import { sleep, equipBestToolForBlock } from './helpers/helpers';
dotenv.config();

export class MiningService {
  private bot: Bot;
  private navigation: Navigation;
  private sharedState: SharedAgentState;

  constructor(bot: Bot, navigation: Navigation, sharedState: SharedAgentState) {
    this.bot = bot;
    this.navigation = navigation;
    this.sharedState = sharedState;
  }

  /**
   * Mines a specified block type until the desired number of blocks has been mined.
   */
  async mine(goalBlock: string, desiredCount: number): Promise<void> {
    // Exact copy from Actions.mine
    await this.bot.waitForChunksToLoad();
    this.sharedState.addPendingAction(`Mine ${goalBlock} x${desiredCount}`);
    await equipBestToolForBlock(this.bot, goalBlock);

    let count = 0;
    while (count < desiredCount) {
      const blockPositions = this.bot.findBlocks({
        point: this.bot.entity.position,
        matching: (block) => block?.name === goalBlock, // Added optional chaining for safety
        maxDistance: 500, // Kept original value
      });

      if (blockPositions.length === 0) {
        console.log(`[MiningService] No ${goalBlock} found nearby.`);
        await sleep(100); // Use internal sleep
        break;
      }

      const botPos = this.bot.entity.position;
      let closestBlockPos = blockPositions[0];
      let closestDistance = botPos.distanceTo(closestBlockPos);

      // Find the closest block position
      for (let i = 1; i < blockPositions.length; i++) {
        const currentDistance = botPos.distanceTo(blockPositions[i]);
        if (currentDistance < closestDistance) {
          closestDistance = currentDistance;
          closestBlockPos = blockPositions[i];
        }
      }

      const block = this.bot.blockAt(closestBlockPos);
      // Ensure block is not null before proceeding
      if (!block) {
        console.log(
          `[MiningService] Could not find block at expected position ${closestBlockPos.toString()}. Skipping.`
        );
        continue;
      }

      // Navigate to the block
      await this.navigation.moveToLookAt(
        closestBlockPos.x,
        closestBlockPos.y,
        closestBlockPos.z
      );

      try {
        await this.bot.dig(block);
        count++;
        console.log(
          `[MiningService] Mined ${count} of ${desiredCount} ${goalBlock}.`
        );
      } catch (err) {
        // FIX: Use String(err) for safe logging of unknown error types
        console.log(`[MiningService] Error mining block: ${String(err)}`);
      }

      await sleep(200);

      // Check if there are any more blocks of this type in the immediate vicinity (defining the vein)
      const nearbyBlockPositions = this.bot.findBlocks({
        point: closestBlockPos, // Check around the *last mined block*
        matching: (b) => b?.name === goalBlock, // Added optional chaining
        maxDistance: 8, // Kept original value
      });

      // If no more blocks are nearby, assume the vein is finished and collect items.
      if (nearbyBlockPositions.length === 0) {
        await sleep(200); // Use internal sleep
        // Call internal collectDroppedItems
        await this.collectDroppedItems(closestBlockPos, goalBlock);
      }
      // Note: Original logic might collect drops *only* when a vein depletes nearby.
      // If drops should be collected more often, adjust the logic/placement of collectDroppedItems call.
    }
    console.log(
      `[MiningService] Finished mining process after mining ${count} blocks.`
    );
    // Consider if pending action should be removed here or elsewhere
  }

  /**
   * Collect dropped items near the provided origin that match the expected drop for the mined block.
   */
  async collectDroppedItems(origin: Vec3, goalBlock: string): Promise<void> {
    // Exact copy from Actions.collectDroppedItems
    const collectionRadius = 20; // Kept original value
    console.log('[MiningService] collectDroppedItems called.');
    // Look up the expected drop from the mapping.
    // Cast blockDropMapping to a record type to fix the index error.
    const expectedDrop = (blockDropMapping as Record<string, string>)[
      goalBlock
    ];
    if (!expectedDrop) {
      console.log(
        `[MiningService] No expected drop mapping for ${goalBlock}. Skipping drop collection.`
      );
      return;
    }

    // Filter entities to find dropped items matching the expected drop.
    // FIX: Use Entity type instead of any
    const drops = Object.values(this.bot.entities).filter((entity: Entity) => {
      // Use the Entity type
      // FIX: Check entity.name (now type-safe)
      if (entity.name !== 'item') return false; // Check entity name ('item' for dropped items)
      // FIX: Access entity.position (now type-safe) and call distanceTo
      if (entity.position.distanceTo(origin) > collectionRadius) return false;

      // FIX: Call entity.getDroppedItem (now type-safe, confirmed by prismarine-entity.d.ts)
      // FIX: Assign result to a variable typed as Item | null
      const item: Item | null = entity.getDroppedItem();
      // FIX: Access item.name (type-safe, assuming Item has name) after checking item is not null
      return item?.name === expectedDrop; // Use optional chaining for concise null check
    });

    if (drops.length === 0) {
      console.log(
        `[MiningService] No valid dropped ${expectedDrop} items found near the vein origin.`
      );
      return;
    }

    console.log(
      `[MiningService] Collecting ${drops.length} dropped ${expectedDrop} item(s)...`
    );
    for (const drop of drops) {
      // drop is implicitly Entity here
      try {
        // Navigate to the drop's position to pick it up.
        // Use the injected navigation service
        await this.navigation.move(
          drop.position.x,
          drop.position.y,
          drop.position.z
        );
        // FIX: Format Vec3 manually for safe logging
        console.log(
          `[MiningService] Collected drop at (${drop.position.x}, ${drop.position.y}, ${drop.position.z})`
        );
        await sleep(100); // Use internal sleep; slight delay between collecting drops
      } catch (err) {
        // FIX: Use String(err) for safe logging of unknown error types
        console.log(`[MiningService] Error collecting drop: ${String(err)}`);
        // Continue trying to collect other drops
      }
    }
  }
}