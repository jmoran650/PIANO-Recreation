// src/actions/farm.ts
import dotenv from 'dotenv';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import { Navigation } from '../navigation';
import { SharedAgentState } from '../sharedAgentState';
// Removed: equipBestToolForBlock import/local definition as it's replaced by equipHoe

dotenv.config();

export class FarmingService {
  private bot: Bot;
  private navigation: Navigation;
  private mcData: minecraftData.IndexedData;
  private sharedState: SharedAgentState;

  constructor(
    bot: Bot,
    navigation: Navigation,
    sharedState: SharedAgentState
  ) {
    this.bot = bot;
    this.navigation = navigation;
    this.sharedState = sharedState;
    const minecraftVersion = process.env.MINECRAFT_VERSION; // Store in variable
    if (minecraftVersion == undefined) {
      throw new Error('[FarmingService] Minecraft Version Undefined');
    }
    // FIX: Ensure minecraftVersion is passed correctly if required by the function signature
    this.mcData = minecraftData(minecraftVersion);
  }

  async plantCrop(cropName: string): Promise<void> {
    const seedItemName = cropName.includes('_seeds')
      ? cropName
      : `${cropName}_seeds`; // Ensure correct seed name
    console.log(`[FarmingService] Attempting to plant ${seedItemName}...`);

    // FIX: Add explicit type Item | null
    const seedItem: Item | null = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName[seedItemName]?.id, // Use optional chaining for safety
      null, // metadata, null means any
      false // NBT check disabled
    );

    if (!seedItem) {
      console.log(
        `[FarmingService] No seeds (${seedItemName}) found in inventory.`
      );
      return;
    }

    // Check for farmland below the target placement spot
    // Target spot is one block in front, at the bot's feet level
    // FIX: Add explicit type Vec3
    const targetPlantPos: Vec3 = this.bot.entity.position
      .floored()
      .offset(0, 0, 1); // Adjust offset based on desired planting location relative to bot
    // FIX: Add explicit type Block | null
    const blockBelowTarget: Block | null = this.bot.blockAt(
      targetPlantPos.offset(0, -1, 0)
    );

    if (!blockBelowTarget || blockBelowTarget.name !== 'farmland') {
      const belowPos = targetPlantPos.offset(0, -1, 0);
      // FIX: Format Vec3 manually for safe logging
      console.log(
        `[FarmingService] No farmland found at (${belowPos.x}, ${belowPos.y}, ${belowPos.z}) to plant on.`
      );
      // Optional: Add logic here to *create* farmland if holding a hoe and standing on dirt/grass
      return;
    }

    // Ensure the spot itself is air
    // FIX: Add explicit type Block | null
    const blockAtTarget: Block | null = this.bot.blockAt(targetPlantPos);
    if (!blockAtTarget || blockAtTarget.name !== 'air') {
      // FIX: Format Vec3 manually for safe logging
      console.log(
        `[FarmingService] Target planting spot at (${targetPlantPos.x}, ${targetPlantPos.y}, ${targetPlantPos.z}) is not air.`
      );
      return;
    }

    try {
      await this.bot.equip(seedItem, 'hand');
      // Reference block is the farmland block, place seeds *onto* it (offset 0, 1, 0 relative to farmland)
      await this.bot.placeBlock(blockBelowTarget, new Vec3(0, 1, 0));
      console.log(`[FarmingService] ${seedItemName} planted successfully!`);
    } catch (err: unknown) { // FIX: Catch error as unknown
      // FIX: Handle unknown error safely
      console.log(`[FarmingService] Error planting crop: ${String(err)}`);
    }
  }

  async harvestCrop(cropName: string): Promise<void> {
    console.log(
      `[FarmingService] Looking for mature ${cropName} to harvest...`
    );

    // Find nearby mature crops
    const blockPositions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block: Block | null): block is Block => { // Type added
        if (!block || !block.name.includes(cropName)) return false;
        // Add specific maturity checks if mcData provides them for the crop
        // Example for wheat (usually stage 7 is mature):
        if (cropName === 'wheat' && block.metadata !== 7) return false;
        // Add checks for other crops (potatoes, carrots, beetroot often use age 7, nether wart uses age 3)
        if (
          (cropName === 'potatoes' ||
            cropName === 'carrots' ||
            cropName === 'beetroots') &&
          block.metadata !== 7
        )
          return false;
        if (cropName === 'nether_wart' && block.metadata !== 3) return false;
        // Default assumption if no specific check: any block with the name is harvestable
        return true;
      },
      maxDistance: 10, // Keep reasonable search distance
      count: 5, // Try to find a few nearby
    });

    if (blockPositions.length === 0) {
      console.log(`[FarmingService] No mature ${cropName} found nearby.`);
      return;
    }

    // Optional: Choose the closest one
    // FIX: Add explicit type Vec3
    const botPos: Vec3 = this.bot.entity.position;
    blockPositions.sort((a, b) => botPos.distanceTo(a) - botPos.distanceTo(b));
    // FIX: Add explicit type Vec3
    const pos: Vec3 = blockPositions[0];

    // FIX: Add explicit type Block | null
    const block: Block | null = this.bot.blockAt(pos);
    if (!block) {
      console.log(
        '[FarmingService] Could not resolve crop block at found position.'
      );
      return;
    }

    // Equip the best hoe specifically for harvesting
    await this.equipHoe(); // <-- Use the new specific method

    // Navigate closer if needed
    try {
      // Move to a position adjacent to the block for digging
      // Assuming navigation can handle a null block gracefully if it happens, though we checked above
      await this.navigation.moveToInteractRange(block);
    } catch (err: unknown) { // FIX: Catch error as unknown
      // FIX: Handle unknown error safely and format Vec3 manually
      console.log(
        `[FarmingService] Failed to move close to crop at (${pos.x}, ${pos.y}, ${pos.z}): ${String(
          err
        )}. Attempting to dig anyway.`
      );
    }

    // Dig the block
    try {
      await this.bot.dig(block);
      console.log(`[FarmingService] ${cropName} harvested!`);
      // Optional: Add logic to collect drops if needed
      // Optional: Replant if holding seeds
    } catch (err: unknown) { // FIX: Catch error as unknown
      // FIX: Handle unknown error safely
      console.log(`[FarmingService] Error harvesting crop: ${String(err)}`);
    }
  }

  /**
   * Equips the best available hoe from the inventory.
   */
  private async equipHoe(): Promise<void> {
    const hoeTiers: string[] = [
      'netherite_hoe',
      'diamond_hoe',
      'golden_hoe', // Note: Golden tools are fast but have low durability
      'iron_hoe',
      'stone_hoe',
      'wooden_hoe',
    ];

    let bestHoeFound: Item | null = null;

    for (const toolName of hoeTiers) {
      // FIX: Add explicit type Item | undefined
      const toolItem: Item | undefined = this.bot.inventory
        .items()
        .find((it) => it.name === toolName);
      if (toolItem) {
        bestHoeFound = toolItem;
        break; // Found the best one available
      }
    }

    if (bestHoeFound) {
      // Check if already equipped
      if (this.bot.heldItem?.type === bestHoeFound.type) {
        // console.log(`[FarmingService] Already holding ${bestHoeFound.name}.`);
        return;
      }

      try {
        await this.bot.equip(bestHoeFound, 'hand');
        console.log(`[FarmingService] Equipped ${bestHoeFound.name}.`);
      } catch (err: unknown) { // FIX: Catch error as unknown
        // FIX: Handle unknown error safely and ensure safe access to name
        console.error(
          `[FarmingService] Failed to equip hoe ${
            bestHoeFound?.name ?? 'unknown' // Use optional chaining just in case
          }: ${String(err)}`
        );
      }
    } else {
      console.log('[FarmingService] No hoe found in inventory.');
    }
  }
}