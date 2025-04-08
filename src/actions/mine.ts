// src/actions/MiningService.ts
import dotenv from "dotenv";

import { Bot } from "mineflayer";

import { Vec3 } from "vec3";
import { blockDropMapping } from "../../data/minecraftItems";
import { Navigation } from "../navigation";

import { SharedAgentState } from "../sharedAgentState";
import { sleep, equipBestToolForBlock } from "./helpers/helpers";
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
    this.bot.waitForChunksToLoad();
    this.sharedState.addPendingAction(`Mine ${goalBlock} x${desiredCount}`);
    await equipBestToolForBlock(this.bot, goalBlock);

    let count = 0;
    while (count < desiredCount) {
      const blockPositions = this.bot.findBlocks({
        point: this.bot.entity.position,
        matching: (block) => block && block.name === goalBlock,
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
      if (!block) continue;

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
        console.log(`[MiningService] Error mining block: ${err}`);
      }

      await sleep(200);

      // Check if there are any more blocks of this type in the immediate vicinity (defining the vein)
      const nearbyBlockPositions = this.bot.findBlocks({
        point: closestBlockPos, // Check around the *last mined block*
        matching: (b) => b && b.name === goalBlock,
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
    console.log("[MiningService] collectDroppedItems called.");
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
    const drops = Object.values(this.bot.entities).filter((entity: any) => {
      // Type entity more strictly if possible
      if (entity.name !== "item") return false; // Check entity type ('object' for items) name:'item'
      if (entity.position.distanceTo(origin) > collectionRadius) return false;
      // Check for existence of getDroppedItem before calling
      if (!entity.getDroppedItem || typeof entity.getDroppedItem !== "function")
        return false;
      // Check item metadata/name
      const item = entity.getDroppedItem();
      return item && item.name === expectedDrop;
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
      try {
        // Navigate to the drop's position to pick it up.
        // Use the injected navigation service
        await this.navigation.move(
          drop.position.x,
          drop.position.y,
          drop.position.z
        );
        console.log(`[MiningService] Collected drop at ${drop.position}`);
        await sleep(100); // Use internal sleep; slight delay between collecting drops
      } catch (err) {
        console.log(`[MiningService] Error collecting drop: ${err}`);
        // Continue trying to collect other drops
      }
    }
  }
}
