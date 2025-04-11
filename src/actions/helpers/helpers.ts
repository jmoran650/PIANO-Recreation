// src/actions/helpers.ts
import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';
import { Item } from 'prismarine-item'; // Added import for Item type

/**
 * Checks if placing a block at targetPos onto referenceBlock seems possible.
 * Logs a warning if placement is deemed unlikely.
 * @param bot - The Mineflayer bot instance.
 * @param mcData - The minecraft-data instance for checking block properties.
 * @param targetPos - The Vec3 position where the new block will be placed.
 * @param referenceBlock - The Block instance below targetPos that the new block will be placed on.
 * @returns {boolean} True if placement seems possible, false otherwise.
 */
export function checkPlacementPossible(
    bot: Bot,
    mcData: any, // Type properly if you have specific mcData typings
    targetPos: Vec3,
    referenceBlock: Block | null
): boolean { // Changed return type to boolean
    const targetBlock = bot.blockAt(targetPos);
    let failureReason: string | null = null;

    if (!referenceBlock) {
        failureReason = 'Reference block below target is missing';
    } else if (referenceBlock.boundingBox !== 'block') {
        failureReason = `Reference block '${referenceBlock.name}' is not solid ('${referenceBlock.boundingBox}')`;
    } else if (!targetBlock) {
        failureReason = 'Target block data could not be retrieved';
    } else if (mcData.blocks[targetBlock.type]?.boundingBox !== 'empty') {
        failureReason = `Target block '${targetBlock.name}' is not empty/replaceable ('${mcData.blocks[targetBlock.type]?.boundingBox}')`;
    }

    if (failureReason) {
        // Log the reason but return false instead of throwing
        console.warn(`[Helper:checkPlacementPossible] Placement check failed at ${targetPos}: ${failureReason}.`);
        return false; // Return false on failure
    }

    // If no failure reason, placement seems possible
    console.log(`[Helper:checkPlacementPossible] Placement check passed for target ${targetPos} on reference ${referenceBlock?.name}@${referenceBlock?.position}`);
    return true; // Return true on success
}


/**
 * Provides a delay for a specified number of milliseconds.
 * @param ms - The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified delay.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Finds a nearby placed crafting table block within a specified distance.
 * @param bot - The mineflayer Bot instance.
 * @param maxDistance - The maximum distance to search.
 * @returns The Block object if found, otherwise null.
 */
export function findNearbyPlacedTable(
  bot: Bot,
  maxDistance: number
): Block | null {
  if (!bot) return null; // Basic guard clause

  const tablePositions = bot.findBlocks({
    point: bot.entity.position,
    matching: (block): block is Block =>
      block !== null && block.name === 'crafting_table', // Type guard added
    maxDistance,
    count: 1,
  });

  if (tablePositions.length === 0) return null;

  const pos = tablePositions[0];
  return bot.blockAt(pos); // blockAt can return null, the caller should handle this
}

/**
 * Calculates positions forming a square ring around (0,0,0) at a given distance.
 * @param distance - The distance of the ring from the center.
 * @returns An array of Vec3 positions forming the ring.
 */
export function getRingPositions(distance: number): Vec3[] {
  const positions: Vec3[] = [];
  // Ensure distance is a positive integer
  const d = Math.max(1, Math.floor(Math.abs(distance)));

  for (let dx = -d; dx <= d; dx++) {
    for (let dz = -d; dz <= d; dz++) {
      // Include only points on the perimeter of the square
      if (Math.max(Math.abs(dx), Math.abs(dz)) === d) {
        positions.push(new Vec3(dx, 0, dz)); // Assuming ring is on the horizontal plane (y=0 relative)
      }
    }
  }
  return positions;
}

/**
 * Finds a safe nearby position (air block with solid ground below) to place a block.
 * Based on the original logic in actions.ts, with added check for solid ground.
 * @param bot - The mineflayer Bot instance.
 * @returns A Vec3 position if a safe spot is found, otherwise null.
 */
export function findSafePlacement(bot: Bot): Vec3 | null {
  if (!bot?.entity?.position) return null; // Guard clause

  // It's good practice to wait for chunks, but repeated calls might slow things down.
  // Consider calling this once before a sequence of placements if needed.
  // await bot.waitForChunksToLoad(); // Maybe call outside this helper

  const pos = bot.entity.position;
  const botBlockPos = new Vec3(
    Math.floor(pos.x),
    Math.floor(pos.y),
    Math.floor(pos.z)
  );
  const headBlockPos = botBlockPos.offset(0, 1, 0); // Position of the bot's head block

  // Search distances 2 and 3 blocks away
  for (let d = 2; d <= 3; d++) {
    // Check at the bot's foot level (yOffset=0) and head level (yOffset=1)
    for (let yOffset = 0; yOffset <= 1; yOffset++) {
      const checkY = botBlockPos.y + yOffset;
      const ring = getRingPositions(d); // Use the helper function

      for (const offset of ring) {
        const candidatePos = new Vec3(
          botBlockPos.x + offset.x,
          checkY,
          botBlockPos.z + offset.z
        );

        // Avoid suggesting placement within the bot's own space
        if (
          candidatePos.equals(botBlockPos) ||
          candidatePos.equals(headBlockPos)
        ) {
          continue;
        }

        const blockAtCandidate = bot.blockAt(candidatePos);
        const blockBelowCandidate = bot.blockAt(candidatePos.offset(0, -1, 0));

        // Check if the candidate spot is 'air', has a solid 'block' below it, and is likely loaded (canSeeBlock)
        if (
          blockAtCandidate &&
          blockAtCandidate.name === 'air' &&
          blockBelowCandidate &&
          blockBelowCandidate.boundingBox === 'block' && // Check for solid ground
          bot.canSeeBlock(blockAtCandidate)
        ) {
          // Ensures the block is within loaded/visible chunks
          console.log(`[Helpers] Found safe placement spot at ${candidatePos}`);
          return candidatePos;
        }
      }
    }
  }

  console.log('[Helpers] Could not find a safe placement spot nearby.');
  return null;
}

export async function equipBestToolForBlock(
  bot: Bot,
  blockName: string
): Promise<void> {
  let toolCategory: 'pickaxe' | 'axe' | 'shovel' | 'hoe' | null = null;

  // Determine tool category based on block name (Combine logic from MiningService and FarmingService)
  if (
    blockName.includes('ore') ||
    blockName.includes('stone') ||
    blockName === 'cobblestone' ||
    blockName === 'basalt' ||
    blockName === 'blackstone' ||
    blockName === 'furnace' ||
    blockName === 'dispenser' ||
    blockName === 'dropper' ||
    blockName === 'observer' ||
    blockName === 'netherrack' ||
    blockName === 'crafting_table'
  ) {
    toolCategory = 'pickaxe';
  } else if (
    blockName.includes('log') ||
    blockName.includes('wood') ||
    blockName.includes('planks') ||
    blockName === 'chest'
  ) {
    toolCategory = 'axe';
  } else if (
    blockName.includes('dirt') ||
    blockName.includes('sand') ||
    blockName.includes('gravel') ||
    blockName.includes('soul_sand') ||
    blockName.includes('soul_soil') ||
    blockName === 'grass_block' ||
    blockName === 'mycelium' ||
    blockName === 'podzol' ||
    blockName === 'farmland' ||
    blockName.includes('clay')
  ) {
    toolCategory = 'shovel';
  } else if (
    blockName.includes('crop') ||
    blockName.includes('wart') ||
    blockName.includes('leaves') ||
    blockName === 'hay_block' ||
    blockName === 'target' ||
    blockName === 'shroomlight' ||
    blockName === 'sponge' ||
    blockName === 'sculk'
  ) {
    toolCategory = 'hoe';
  }

  if (!toolCategory) {
    // console.log(`[Helpers] No specific tool category determined for: ${blockName}. Tool not changed.`);
    return; // No specific tool needed or recognized
  }

  const toolMaterials = ['netherite', 'diamond', 'iron', 'stone', 'wooden'];
  let bestToolFound: Item | null = null;

  // Find the best available tool in inventory
  for (const material of toolMaterials) {
    const toolName = `${material}_${toolCategory}`;
    const toolItem = bot.inventory
      .items()
      .find((item) => item.name === toolName);
    if (toolItem) {
      bestToolFound = toolItem;
      break; // Found the best tier, no need to check lower tiers
    }
  }

  // Fallback check for base tool (e.g. 'axe' itself, though unlikely in vanilla)
  if (!bestToolFound) {
    const baseToolName = toolCategory; // e.g. "pickaxe"
    const toolItem = bot.inventory
      .items()
      .find((item) => item.name === baseToolName);
    if (toolItem) {
      bestToolFound = toolItem;
    }
  }

  // Equip the best tool if found and not already held
  if (bestToolFound) {
    try {
      if (bot.heldItem?.type === bestToolFound.type) {
        // console.log(`[Helpers] Already holding the best tool: ${bestToolFound.name}`);
        return; // Already holding the best tool
      }
      await bot.equip(bestToolFound, 'hand');
      console.log(`[Helpers] Equipped ${bestToolFound.name} for ${blockName}`);
    } catch (err) {
      console.log(
        `[Helpers] Failed to equip tool ${bestToolFound.name}: ${err}`
      );
    }
  } else {
    // console.log(`[Helpers] No suitable ${toolCategory} found in inventory for ${blockName}.`);
    // Optional: Unequip current tool or equip fists if desired
  }
}
