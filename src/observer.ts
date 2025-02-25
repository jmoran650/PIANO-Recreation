// src/observer.ts
import { Bot } from "mineflayer"
import type { Entity } from "prismarine-entity"
import type { Block } from "prismarine-block"
import { Vec3 } from "vec3"
import minecraftData from "minecraft-data"
import { SharedAgentState } from "./sharedAgentState"

export interface IObserverOptions {
  radius?: number
}

type Vec3Type = Vec3

export class Observer {
  private bot: Bot
  private radius: number
  private sharedState: SharedAgentState
  private mcData: any

  constructor(bot: Bot, options: IObserverOptions = {}, sharedState: SharedAgentState) {
    this.bot = bot
    this.radius = options.radius ?? 16
    this.sharedState = sharedState
    // We need minecraft-data to look up items and recipes.
    this.mcData = minecraftData("1.21.4")
  }

  /**
   * ------------------------------
   * 1) Visible Environment Methods
   * ------------------------------
   */

  /**
   * Returns an object describing each unique block type (other than air)
   * within `this.radius` of the bot, along with the coordinates of the closest
   * block of that type.
   */
  public async getVisibleBlockTypes(): Promise<{
    BlockTypes: { [blockName: string]: { x: number; y: number; z: number } }
  }> {
    await this.bot.waitForChunksToLoad()

    const positions = this.bot.findBlocks({
      point: this.bot.entity.position,
      maxDistance: this.radius,
      matching: (block: Block | null) => block !== null && block.name !== "air",
      count: 9999
    })

    interface BlockInfo {
      blockName: string
      distance: number
      pos: Vec3Type
    }

    const blockInfos: BlockInfo[] = []
    const botPos = this.bot.entity.position

    for (const pos of positions) {
      const block = this.bot.blockAt(pos) as Block | null
      if (!block) continue
      const distance = botPos.distanceTo(pos)
      blockInfos.push({
        blockName: block.name,
        distance,
        pos
      })
    }

    const closestByType: { [key: string]: { distance: number; pos: Vec3Type } } = {}
    for (const info of blockInfos) {
      const existing = closestByType[info.blockName]
      if (!existing || info.distance < existing.distance) {
        closestByType[info.blockName] = { distance: info.distance, pos: info.pos }
      }
    }

    const result: {
      BlockTypes: { [blockName: string]: { x: number; y: number; z: number } }
    } = { BlockTypes: {} }
    for (const blockName of Object.keys(closestByType)) {
      const { pos } = closestByType[blockName]
      result.BlockTypes[blockName] = { x: pos.x, y: pos.y, z: pos.z }
    }

    this.sharedState.visibleBlockTypes = result
    return result
  }

  /**
   * Returns an object containing a list of mobs within `this.radius`.
   */
  public async getVisibleMobs(): Promise<{ Mobs: { name: string; distance: number }[] }> {
    await this.bot.waitForChunksToLoad()

    const center = this.bot.entity.position
    const result = { Mobs: [] as { name: string; distance: number }[] }

    for (const id in this.bot.entities) {
      const entity = this.bot.entities[id] as Entity
      if (!entity || entity === this.bot.entity || (entity as any).username) continue
      const dist = center.distanceTo(entity.position)
      if (dist <= this.radius) {
        const name = entity.name ?? "unknown_mob"
        result.Mobs.push({ name, distance: parseFloat(dist.toFixed(2)) })
      }
    }

    this.sharedState.visibleMobs = result
    return result
  }

  /**
   * ----------------------------
   * 2) Inventory Observation
   * ----------------------------
   */

  /**
   * Returns a list of items in each occupied slot of the bot's inventory.
   * For example: ["iron_ingot:3", "redstone:64", "iron_ingot:4"].
   * Empty slots are not included, and items of the same name in different
   * slots are kept separate.
   */
  public getInventoryContents(): string[] {
    // Mineflayer's `bot.inventory.items()` returns all items (excluding empty slots).
    const items = this.bot.inventory.items()
    return items.map((item) => `${item.name}:${item.count}`)
  }

  /**
   * ----------------------------
   * 3) Recipe Examination
   * ----------------------------
   */

  /**
   * Returns a human-readable list of known recipes for the specified item.
   * If multiple recipes exist, each is listed separately.
   *
   * You could return a more structured format, but here we build
   * a string for clarity in chat responses.
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
      // Determine the ingredients list.
      let ingredients: any[] = [];
      if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
        ingredients = recipe.ingredients;
      } else if (recipe.inShape && Array.isArray(recipe.inShape)) {
        // Flatten the 2D array and filter out placeholder items (id === -1)
        ingredients = recipe.inShape.flat().filter((ing: any) => ing && ing.id !== -1);
      }
      if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
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

  /**
   * Checks if the bot's current inventory satisfies *at least one* known
   * recipe for the given item. This does NOT consider crafting intermediate
   * items (e.g., if the bot is short on sticks, it won't look for planks to craft them).
   */
  public canCraftItem(itemName: string): boolean {
    const itemData = this.mcData.itemsByName[itemName]
    if (!itemData) return false

    const recipes = this.bot.recipesFor(itemData.id, null, 1, null)
    if (recipes.length === 0) return false

    // Check each recipe to see if we can satisfy it with what's in the inventory right now.
    for (const recipe of recipes) {
      if (this.hasAllIngredientsForRecipe(recipe)) {
        return true
      }
    }
    return false
  }

  /**
   * Helper: returns true if the current inventory has all the needed
   * ingredients for the given recipe.
   */
  private hasAllIngredientsForRecipe(recipe: any): boolean {
    // Tally up recipe requirements.
    const needed = new Map<number, number>()
    for (const ing of recipe.ingredients) {
      needed.set(ing.id, (needed.get(ing.id) || 0) + ing.count)
    }

    // Tally up the bot's inventory.
    const invCounts = new Map<number, number>()
    for (const slot of this.bot.inventory.items()) {
      invCounts.set(slot.type, (invCounts.get(slot.type) || 0) + slot.count)
    }

    // Check if we meet or exceed each required ingredient count.
    for (const [reqId, reqCount] of needed.entries()) {
      const haveCount = invCounts.get(reqId) || 0
      if (haveCount < reqCount) {
        return false
      }
    }
    return true
  }

  /**
   * ----------------------------
   * 5) Potential Craftability
   * ----------------------------
   * This method checks if we can eventually craft the item by also crafting
   * any missing ingredients. This is a more complex or "recursive" approach.
   */

  /**
   * Returns true if the bot can eventually craft `itemName`, possibly
   * crafting intermediate items if required. This is a naive depth-limited
   * search: if the bot is missing an ingredient, we see if that ingredient
   * can itself be crafted from the inventory (and so on).
   *
   * NOTE: This approach can get complicated if there are multiple
   * sub-ingredient recipes or cyclical recipes. We present a simple version.
   */
  public canEventuallyCraftItem(itemName: string): boolean {
    const itemData = this.mcData.itemsByName[itemName]
    if (!itemData) return false

    const recipes = this.bot.recipesFor(itemData.id, null, 1, null)
    if (recipes.length === 0) return false

    // We clone the bot's inventory as a "virtual" inventory for testing.
    const virtualInventory = new Map<number, number>()
    for (const slot of this.bot.inventory.items()) {
      virtualInventory.set(slot.type, (virtualInventory.get(slot.type) || 0) + slot.count)
    }

    // Attempt each recipe to see if we can satisfy it (possibly sub-crafting).
    for (const recipe of recipes) {
      if (this.canCraftWithSubrecipes(recipe, virtualInventory, new Set())) {
        return true
      }
    }
    return false
  }

  /**
   * Helper: tries to see if the given recipe can be satisfied with the
   * provided "virtualInventory." If missing ingredients, attempts to craft them
   * if there is a known recipe for them. Updates the virtualInventory if successful.
   * We use a visited set to avoid infinite loops in case of cyclical recipes.
   */
  private canCraftWithSubrecipes(recipe: any, inv: Map<number, number>, visited: Set<number>): boolean {
    // Tally up required ingredients
    const needed = new Map<number, number>()
    for (const ing of recipe.ingredients) {
      needed.set(ing.id, (needed.get(ing.id) || 0) + ing.count)
    }

    // Check each needed ingredient
    for (const [reqId, reqCount] of needed.entries()) {
      const haveCount = inv.get(reqId) || 0
      if (haveCount < reqCount) {
        // We are missing some portion of reqId. Let's see if we can craft it.
        // If we've visited this item before, to avoid infinite loops, we bail out.
        if (visited.has(reqId)) return false
        visited.add(reqId)

        // Find a recipe for this sub-item
        const subItemName = this.mcData.items[reqId]?.name
        if (!subItemName) return false

        const subRecipes = this.bot.recipesFor(reqId, null, 1, null)
        if (subRecipes.length === 0) {
          // No direct recipe to create this item, so fail.
          return false
        }

        // Attempt each sub-recipe to see if we can produce the missing amount
        const missingAmount = reqCount - haveCount
        let subCrafted = false
        for (const subRecipe of subRecipes) {
          // We'll see if we can craft enough of this sub-item
          // The logic below is simplified: it tries to craft the entire
          // `missingAmount` from one subRecipe, ignoring partial usage of multiple.
          if (this.canCraftWithSubrecipes(subRecipe, inv, visited)) {
            // If subRecipe is feasible, we "virtually" add enough items
            // for the missing amount. In a more robust approach, you'd
            // check how many times you can produce it, etc.
            inv.set(reqId, haveCount + missingAmount)
            subCrafted = true
            break
          }
        }
        if (!subCrafted) return false
      }
    }
    // If we get here, we have or can craft all ingredients
    return true
  }
}