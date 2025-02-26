// src/observer.ts
import { Bot } from "mineflayer";
import type { Entity } from "prismarine-entity";
import type { Block } from "prismarine-block";
import { Vec3 } from "vec3";
import minecraftData from "minecraft-data";
import { SharedAgentState } from "./sharedAgentState";

export interface IObserverOptions {
  radius?: number;
}

type Vec3Type = Vec3;

export class Observer {
  private bot: Bot;
  private radius: number;
  private sharedState: SharedAgentState;
  private mcData: any;

  constructor(
    bot: Bot,
    options: IObserverOptions = {},
    sharedState: SharedAgentState
  ) {
    this.bot = bot;
    this.radius = options.radius ?? 16;
    this.sharedState = sharedState;
    // We need minecraft-data to look up items and recipes.
    this.mcData = minecraftData("1.21.4");

    // Schedule periodic updates of the bot's inventory, health, and hunger.
    setInterval(() => {
      this.updateBotStats();
    }, 1000);
  }

  /**
   * New method to update the shared state with current bot stats.
   */
  public updateBotStats(): void {
    const inventory = this.getInventoryContents();
    this.sharedState.inventory = inventory;
    // Assumes mineflayer bot has properties "health" and "food"
    this.sharedState.botHealth = this.bot.health;
    this.sharedState.botHunger = this.bot.food;
  }

  /**
   * ------------------------------
   * 1) Visible Environment Methods
   * ------------------------------
   */
  public async getVisibleBlockTypes(): Promise<{
    BlockTypes: { [blockName: string]: { x: number; y: number; z: number } };
  }> {
    await this.bot.waitForChunksToLoad();

    const positions = this.bot.findBlocks({
      point: this.bot.entity.position,
      maxDistance: this.radius,
      matching: (block: Block | null) => block !== null && block.name !== "air",
      count: 9999,
    });

    interface BlockInfo {
      blockName: string;
      distance: number;
      pos: Vec3Type;
    }

    const blockInfos: BlockInfo[] = [];
    const botPos = this.bot.entity.position;

    for (const pos of positions) {
      const block = this.bot.blockAt(pos) as Block | null;
      if (!block) continue;
      const distance = botPos.distanceTo(pos);
      blockInfos.push({
        blockName: block.name,
        distance,
        pos,
      });
    }

    const closestByType: {
      [key: string]: { distance: number; pos: Vec3Type };
    } = {};
    for (const info of blockInfos) {
      const existing = closestByType[info.blockName];
      if (!existing || info.distance < existing.distance) {
        closestByType[info.blockName] = {
          distance: info.distance,
          pos: info.pos,
        };
      }
    }

    const result: {
      BlockTypes: { [blockName: string]: { x: number; y: number; z: number } };
    } = { BlockTypes: {} };
    for (const blockName of Object.keys(closestByType)) {
      const { pos } = closestByType[blockName];
      result.BlockTypes[blockName] = { x: pos.x, y: pos.y, z: pos.z };
    }

    this.sharedState.visibleBlockTypes = result;
    return result;
  }

  /**
   * Returns an object containing a list of mobs within `this.radius`.
   */
  public async getVisibleMobs(): Promise<{
    Mobs: { name: string; distance: number }[];
  }> {
    await this.bot.waitForChunksToLoad();

    const center = this.bot.entity.position;
    const result = { Mobs: [] as { name: string; distance: number }[] };

    for (const id in this.bot.entities) {
      const entity = this.bot.entities[id] as Entity;
      if (!entity || entity === this.bot.entity || (entity as any).username)
        continue;
      const dist = center.distanceTo(entity.position);
      if (dist <= this.radius) {
        const name = entity.name ?? "unknown_mob";
        result.Mobs.push({ name, distance: parseFloat(dist.toFixed(2)) });
      }
    }

    this.sharedState.visibleMobs = result;
    return result;
  }

  /**
   * ----------------------------
   * 2) Inventory Observation
   * ----------------------------
   *
   * Returns an array where the first element is a header indicating the number
   * of empty main inventory slots (assuming 36 slots total) and subsequent elements
   * are strings representing occupied slots as "itemName:count".
   */
  public getInventoryContents(): string[] {
    // Get all occupied main inventory slots (mineflayer's items() excludes empty slots)
    const items = this.bot.inventory.items();
    const totalMainSlots = 36; // 27 storage + 9 hotbar
    const emptySlots = totalMainSlots - items.length;
    const header = `Empty slots: ${emptySlots}`;
    const itemStrings = items.map((item) => `${item.name}:${item.count}`);
    return [header, ...itemStrings];
  }

  /**
   * New method to return what is equipped in the armor and offhand slots.
   * Uses bot.getEquipmentDestSlot() to locate the slot indices.
   */
  public getEquippedItems(): {
    head: string | null;
    chest: string | null;
    legs: string | null;
    feet: string | null;
    offhand: string | null;
  } {
    const headSlot = this.bot.getEquipmentDestSlot("head");
    const chestSlot = this.bot.getEquipmentDestSlot("torso"); // Chestplate
    const legsSlot = this.bot.getEquipmentDestSlot("legs");
    const feetSlot = this.bot.getEquipmentDestSlot("feet");
    const offhandSlot = this.bot.getEquipmentDestSlot("off-hand");

    const head = this.bot.inventory.slots[headSlot]
      ? `${this.bot.inventory.slots[headSlot].name}:${this.bot.inventory.slots[headSlot].count}`
      : null;
    const chest = this.bot.inventory.slots[chestSlot]
      ? `${this.bot.inventory.slots[chestSlot].name}:${this.bot.inventory.slots[chestSlot].count}`
      : null;
    const legs = this.bot.inventory.slots[legsSlot]
      ? `${this.bot.inventory.slots[legsSlot].name}:${this.bot.inventory.slots[legsSlot].count}`
      : null;
    const feet = this.bot.inventory.slots[feetSlot]
      ? `${this.bot.inventory.slots[feetSlot].name}:${this.bot.inventory.slots[feetSlot].count}`
      : null;
    const offhand = this.bot.inventory.slots[offhandSlot]
      ? `${this.bot.inventory.slots[offhandSlot].name}:${this.bot.inventory.slots[offhandSlot].count}`
      : null;

    return { head, chest, legs, feet, offhand };
  }
  /**
   * ----------------------------
   * 3) Recipe Examination
   * ----------------------------
   */
  public getRecipeForItem(itemName: string): string {
    const itemData = this.mcData.itemsByName[itemName];
    if (!itemData) {
      return `No item data found for "${itemName}".`;
    }
    const recipes = this.bot.recipesAll(itemData.id, null, true);
    if (recipes.length === 0) {
      return `No crafting recipe found for "${itemName}".`;
    }
    let output = `Recipes for "${itemName}":\n`;
    recipes.forEach((recipe, idx) => {
      output += `  Recipe #${idx + 1} requires:\n`;
      let ingredients: any[] = [];
      if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
        ingredients = recipe.ingredients;
      } else if (recipe.inShape && Array.isArray(recipe.inShape)) {
        ingredients = recipe.inShape
          .flat()
          .filter((ing: any) => ing && ing.id !== -1);
      }
      if (
        !ingredients ||
        !Array.isArray(ingredients) ||
        ingredients.length === 0
      ) {
        output += "    (No ingredients available)\n";
      } else {
        const needed = new Map<number, number>();
        for (const ing of ingredients) {
          needed.set(ing.id, (needed.get(ing.id) || 0) + ing.count);
        }
        for (const [ingId, ingCount] of needed.entries()) {
          const ingName = this.mcData.items[ingId]?.name || `unknown(${ingId})`;
          output += `    - ${ingName} x${ingCount}\n`;
        }
      }
    });
    return output.trim();
  }

  /**
   * ----------------------------
   * 4) Immediate Craftability
   * ----------------------------
   */
  public canCraftItem(itemName: string): boolean {
    const itemData = this.mcData.itemsByName[itemName];
    if (!itemData) return false;

    const recipes = this.bot.recipesFor(itemData.id, null, 1, null);
    if (recipes.length === 0) return false;

    for (const recipe of recipes) {
      if (this.hasAllIngredientsForRecipe(recipe)) {
        return true;
      }
    }
    return false;
  }

  private hasAllIngredientsForRecipe(recipe: any): boolean {
    const needed = new Map<number, number>();
    for (const ing of recipe.ingredients) {
      needed.set(ing.id, (needed.get(ing.id) || 0) + ing.count);
    }

    const invCounts = new Map<number, number>();
    for (const slot of this.bot.inventory.items()) {
      invCounts.set(slot.type, (invCounts.get(slot.type) || 0) + slot.count);
    }

    for (const [reqId, reqCount] of needed.entries()) {
      const haveCount = invCounts.get(reqId) || 0;
      if (haveCount < reqCount) {
        return false;
      }
    }
    return true;
  }

  /**
   * ----------------------------
   * 5) Potential Craftability
   * ----------------------------
   */
  public canEventuallyCraftItem(itemName: string): boolean {
    const itemData = this.mcData.itemsByName[itemName];
    if (!itemData) return false;

    const recipes = this.bot.recipesFor(itemData.id, null, 1, null);
    if (recipes.length === 0) return false;

    const virtualInventory = new Map<number, number>();
    for (const slot of this.bot.inventory.items()) {
      virtualInventory.set(
        slot.type,
        (virtualInventory.get(slot.type) || 0) + slot.count
      );
    }

    for (const recipe of recipes) {
      if (this.canCraftWithSubrecipes(recipe, virtualInventory, new Set())) {
        return true;
      }
    }
    return false;
  }

  private canCraftWithSubrecipes(
    recipe: any,
    inv: Map<number, number>,
    visited: Set<number>
  ): boolean {
    const needed = new Map<number, number>();
    for (const ing of recipe.ingredients) {
      needed.set(ing.id, (needed.get(ing.id) || 0) + ing.count);
    }

    for (const [reqId, reqCount] of needed.entries()) {
      const haveCount = inv.get(reqId) || 0;
      if (haveCount < reqCount) {
        if (visited.has(reqId)) return false;
        visited.add(reqId);

        const subItemName = this.mcData.items[reqId]?.name;
        if (!subItemName) return false;

        const subRecipes = this.bot.recipesFor(reqId, null, 1, null);
        if (subRecipes.length === 0) {
          return false;
        }

        const missingAmount = reqCount - haveCount;
        let subCrafted = false;
        for (const subRecipe of subRecipes) {
          if (this.canCraftWithSubrecipes(subRecipe, inv, visited)) {
            inv.set(reqId, haveCount + missingAmount);
            subCrafted = true;
            break;
          }
        }
        if (!subCrafted) return false;
      }
    }
    return true;
  }
}
