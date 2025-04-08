// src/actions/farm.ts
import dotenv from "dotenv";
import minecraftData from "minecraft-data";
import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { Item } from "prismarine-item"; // Import Item type
import { Vec3 } from "vec3";
import { Navigation } from "../navigation";
import { SharedAgentState } from "../sharedAgentState";
// Removed: equipBestToolForBlock import/local definition as it's replaced by equipHoe

dotenv.config();


export class FarmingService {
  private bot: Bot;
  private navigation: Navigation;
  private mcData: any;
  private sharedState: SharedAgentState;

  constructor(
    bot: Bot,
    navigation: Navigation,
    sharedState: SharedAgentState
  ) {
    this.bot = bot;
    this.navigation = navigation;
    this.sharedState = sharedState;
    if (process.env.MINECRAFT_VERSION == undefined) {
      throw new Error("[FarmingService] Minecraft Version Undefined");
    }
    this.mcData = minecraftData(process.env.MINECRAFT_VERSION);
  }

  async plantCrop(cropName: string): Promise<void> {
    const seedItemName = cropName.includes("_seeds")
      ? cropName
      : `${cropName}_seeds`; // Ensure correct seed name
    console.log(`[FarmingService] Attempting to plant ${seedItemName}...`);
    const seedItem = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName[seedItemName]?.id,
      null,
      false
    );

    if (!seedItem) {
      console.log(
        `[FarmingService] No seeds (${seedItemName}) found in inventory.`
      );
      return;
    }

    // Check for farmland below the target placement spot
    // Target spot is one block in front, at the bot's feet level
    const targetPlantPos = this.bot.entity.position.floored().offset(0, 0, 1); // Adjust offset based on desired planting location relative to bot
    const blockBelowTarget = this.bot.blockAt(targetPlantPos.offset(0, -1, 0));

    if (!blockBelowTarget || blockBelowTarget.name !== "farmland") {
      console.log(
        `[FarmingService] No farmland found at ${targetPlantPos
          .offset(0, -1, 0)
          .toString()} to plant on.`
      );
      // Optional: Add logic here to *create* farmland if holding a hoe and standing on dirt/grass
      return;
    }

    // Ensure the spot itself is air
    const blockAtTarget = this.bot.blockAt(targetPlantPos);
    if (!blockAtTarget || blockAtTarget.name !== "air") {
      console.log(
        `[FarmingService] Target planting spot at ${targetPlantPos.toString()} is not air.`
      );
      return;
    }

    try {
      await this.bot.equip(seedItem, "hand");
      // Reference block is the farmland block, place seeds *onto* it (offset 0, 1, 0 relative to farmland)
      await this.bot.placeBlock(blockBelowTarget, new Vec3(0, 1, 0));
      console.log(`[FarmingService] ${seedItemName} planted successfully!`);
    } catch (err) {
      console.log(`[FarmingService] Error planting crop: ${err}`);
    }
  }

  async harvestCrop(cropName: string): Promise<void> {
    console.log(
      `[FarmingService] Looking for mature ${cropName} to harvest...`
    );

    // Find nearby mature crops
    const blockPositions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block: Block | null): block is Block => {
        if (!block || !block.name.includes(cropName)) return false;
        // Add specific maturity checks if mcData provides them for the crop
        // Example for wheat (usually stage 7 is mature):
        if (cropName === "wheat" && block.metadata !== 7) return false;
        // Add checks for other crops (potatoes, carrots, beetroot often use age 7, nether wart uses age 3)
        if (
          (cropName === "potatoes" ||
            cropName === "carrots" ||
            cropName === "beetroots") &&
          block.metadata !== 7
        )
          return false;
        if (cropName === "nether_wart" && block.metadata !== 3) return false;
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
    const botPos = this.bot.entity.position;
    blockPositions.sort((a, b) => botPos.distanceTo(a) - botPos.distanceTo(b));
    const pos = blockPositions[0];

    const block = this.bot.blockAt(pos);
    if (!block) {
      console.log(
        "[FarmingService] Could not resolve crop block at found position."
      );
      return;
    }

    // Equip the best hoe specifically for harvesting
    await this.equipHoe(); // <-- Use the new specific method

    // Navigate closer if needed
    try {
      // Move to a position adjacent to the block for digging
      await this.navigation.moveToInteractRange(block);
    } catch (err) {
      console.log(
        `[FarmingService] Failed to move close to crop at ${pos}: ${err}. Attempting to dig anyway.`
      );
    }

    // Dig the block
    try {
      await this.bot.dig(block);
      console.log(`[FarmingService] ${cropName} harvested!`);
      // Optional: Add logic to collect drops if needed
      // Optional: Replant if holding seeds
    } catch (err) {
      console.log(`[FarmingService] Error harvesting crop: ${err}`);
    }
  }

  /**
   * Equips the best available hoe from the inventory.
   */
  private async equipHoe(): Promise<void> {
    const hoeTiers: string[] = [
      "netherite_hoe",
      "diamond_hoe",
      "golden_hoe",
      "iron_hoe",
      "stone_hoe",
      "wooden_hoe",
    ];

    let bestHoeFound: Item | null = null;

    for (const toolName of hoeTiers) {
      const toolItem = this.bot.inventory
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
        await this.bot.equip(bestHoeFound, "hand");
        console.log(`[FarmingService] Equipped ${bestHoeFound.name}.`);
      } catch (err) {
        console.error(
          `[FarmingService] Failed to equip hoe ${bestHoeFound.name}: ${err}`
        );
      }
    } else {
      console.log("[FarmingService] No hoe found in inventory.");
    }
  }


}