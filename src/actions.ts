// src/actions.ts
import { Bot } from "mineflayer";
import { Navigation } from "./navigation";
import { Vec3 } from "vec3";
import minecraftData from "minecraft-data";
import { Block } from "prismarine-block";
import { SharedAgentState } from "./sharedAgentState";

declare module "mineflayer" {
  interface BotEvents {
    stoppedAttacking: () => void;
  }
}

export class Actions {
  private bot: Bot;
  private navigation: Navigation;
  private mcData: any;
  private sharedState: SharedAgentState;

  constructor(bot: Bot, navigation: Navigation, sharedState: SharedAgentState) {
    this.bot = bot;
    this.navigation = navigation;
    this.mcData = minecraftData(this.bot.version);
    this.sharedState = sharedState;
  }

  /**
   * Mines a specified block type until the desired number of blocks has been mined.
   */
  async mine(goalBlock: string, desiredCount: number): Promise<void> {
    // Optionally store the planned action in SharedAgentState
    this.sharedState.addPendingAction(`Mine ${goalBlock} x${desiredCount}`);

    let count = 0;
    while (count < desiredCount) {
      const blockPositions = this.bot.findBlocks({
        point: this.bot.entity.position,
        matching: (block) => block && block.name === goalBlock,
        maxDistance: 50,
        count: 1,
      });

      if (blockPositions.length === 0) {
        this.bot.chat(`No ${goalBlock} found nearby.`);
        break;
      }

      const blockPos = blockPositions[0];
      const block = this.bot.blockAt(blockPos);
      if (!block) continue;

      await this.navigation.move(blockPos.x, blockPos.y, blockPos.z);

      try {
        await this.bot.dig(block);
        count++;
        this.bot.chat(`Mined ${count} of ${desiredCount} ${goalBlock} blocks.`);
      } catch (err) {
        this.bot.chat(`Error mining block: ${err}`);
      }

      await this.sleep(500);
    }
  }

  /**
   * Crafts a goal item (if a recipe is available).
   */
  async craft(goalItem: string): Promise<void> {
    this.sharedState.addPendingAction(`Craft ${goalItem}`);

    const itemData = this.mcData.itemsByName[goalItem];
    if (!itemData) {
      this.bot.chat(`No item data found for ${goalItem}.`);
      return;
    }
    const itemId: number = itemData.id;

    const recipes = this.bot.recipesFor(itemId, null, 1, null);
    if (recipes.length === 0) {
      this.bot.chat(`No recipe found for ${goalItem}.`);
      return;
    }
    const recipe = recipes[0];

    try {
      await this.bot.craft(recipe, 1);
      this.bot.chat(`Crafted ${goalItem}.`);
    } catch (err) {
      this.bot.chat(`Couldn't craft ${goalItem}: ${err}`);
    }
  }

  /**
   * Places a block (e.g., furnace or crafting bench).
   */
  async place(blockType: string): Promise<void> {
    this.sharedState.addPendingAction(`Place ${blockType}`);

    let blockItem = this.bot.inventory.items().find((item) => item.name === blockType);
    if (!blockItem) {
      this.bot.chat(`${blockType} not in inventory; trying to craft...`);
      await this.craft(blockType);
      blockItem = this.bot.inventory.items().find((item) => item.name === blockType);
      if (!blockItem) {
        this.bot.chat(`Unable to obtain ${blockType}.`);
        return;
      }
    }

    try {
      await this.bot.equip(blockItem, "hand");
    } catch (err) {
      this.bot.chat(`Failed to equip ${blockType}: ${err}`);
      return;
    }

    const referencePos = this.bot.entity.position.offset(2, 0, 0);
    const maybeRefBlock = this.bot.blockAt(referencePos);
    if (!maybeRefBlock) {
      this.bot.chat("No reference block below me to place onto.");
      return;
    }
    const refBlock: Block = maybeRefBlock;

    try {
      await this.bot.placeBlock(refBlock, new Vec3(0, 1, 0));
      this.bot.chat(`Placed ${blockType}.`);
    } catch (err) {
      this.bot.chat(`Error placing ${blockType}: ${err}`);
    }
  }

  /**
   * Attacks a specified type of mob using the mineflayer-pvp plugin.
   */
  async attack(mobType: string): Promise<void> {
    this.sharedState.addPendingAction(`Attack ${mobType}`);

    const pvp = (this.bot as any).pvp;
    if (!pvp) {
      this.bot.chat("mineflayer-pvp plugin not loaded. Cannot attack.");
      return;
    }

    const mobs = Object.values(this.bot.entities).filter(
      (entity: any) => entity.name && entity.name.toLowerCase() === mobType.toLowerCase()
    );
    if (mobs.length === 0) {
      this.bot.chat(`No ${mobType} found nearby to attack.`);
      return;
    }

    const target = mobs[0];
    this.bot.chat(`Attacking the nearest ${mobType}...`);
    try {
      if (typeof pvp.attack === "function") {
        pvp.attack(target);
        this.bot.once("stoppedAttacking", () => {
          this.bot.chat("Target has been killed!");
        });
      } else {
        this.bot.chat("pvp.attack is not a function. Plugin mismatch?");
      }
    } catch (err: unknown) {
      let errMsg: string = err instanceof Error ? err.message : String(err);
      this.bot.chat(`Error while attacking ${mobType}: ${errMsg}`);
    }
  }

  /**
   * Places a crafting table at a safe nearby position.
   */
  async placeCraftingTable(): Promise<void> {
    this.sharedState.addPendingAction("Place Crafting Table");

    const table = this.bot.inventory.findInventoryItem(this.mcData.itemsByName.crafting_table.id, null, false);
    if (!table) {
      this.bot.chat("I don't have a crafting table!");
      return;
    }

    const safePos = this.findSafePlacement();
    if (!safePos) {
      this.bot.chat("No valid spot to place the crafting table!");
      return;
    }

    try {
      await this.bot.lookAt(safePos.offset(0.5, 0.5, 0.5));
      const referenceBlock = this.bot.blockAt(safePos.offset(0, -1, 0));
      if (!referenceBlock) {
        this.bot.chat("No block found to place the crafting table on.");
        return;
      }
      await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      this.bot.chat("Crafting table placed!");
    } catch (err) {
      this.bot.chat("Failed to place crafting table: " + (err instanceof Error ? err.message : err));
    }
  }

  private findSafePlacement(): Vec3 | null {
    const pos = this.bot.entity.position;
    for (let d = 1; d <= 3; d++) {
      for (let yOffset = 0; yOffset <= 1; yOffset++) {
        const ring = this.getRingPositions(d);
        for (const offset of ring) {
          const candidate = pos.offset(offset.x, yOffset, offset.z);
          const block = this.bot.blockAt(candidate);
          if (block && block.name === "air") {
            return candidate;
          }
        }
      }
    }
    return null;
  }

  private getRingPositions(distance: number): Vec3[] {
    const positions: Vec3[] = [];
    for (let dx = -distance; dx <= distance; dx++) {
      for (let dz = -distance; dz <= distance; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) === distance) {
          positions.push(new Vec3(dx, 0, dz));
        }
      }
    }
    return positions;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Uses a nearby crafting table by right-clicking it.
   */
  async useCraftingTable(): Promise<void> {
    this.sharedState.addPendingAction("Use Crafting Table");

    const positions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: (block: any) => block && block.name === "crafting_table",
      maxDistance: 4.4,
      count: 1,
    });
    if (positions.length === 0) {
      this.bot.chat("No crafting table nearby.");
      return;
    }
    const pos = positions[0];
    const block = this.bot.blockAt(pos);
    if (!block) {
      this.bot.chat("Crafting table block not found.");
      return;
    }
    try {
      await this.bot.activateBlock(block);
      this.bot.chat("Used the crafting table.");
    } catch (err) {
      this.bot.chat("Failed to use crafting table: " + (err instanceof Error ? err.message : err));
    }
  }
}