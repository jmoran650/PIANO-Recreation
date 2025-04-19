import dotenv from "dotenv";
import minecraftData from "minecraft-data";
import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import type { Entity } from "prismarine-entity";
import { Vec3 } from "vec3";
import { hostileMobNames } from "../../data/mobs";
import { SharedAgentState } from "../sharedAgentState";
import * as semver from "semver"; // <-- Added import for semver

dotenv.config();

// Define Vec3Type alias (optional, could use Vec3 directly)
type Vec3Type = Vec3;

// Define types for Recipe and Ingredients based on common usage
interface RecipeIngredient {
  id: number; // Item ID
  count: number; // Amount needed/produced
  metadata?: unknown;
}

interface Recipe {
  // Shaped or shapeless ingredients
  ingredients?: RecipeIngredient[]; // For shapeless or simple recipes
  inShape?: (RecipeIngredient | null)[][]; // For shaped recipes (grid)
  outShape?: (RecipeIngredient | null)[][]; // For shaped recipes (grid output, rare)

  // Result of the recipe
  result: RecipeIngredient; // What the recipe produces

  // Other potential properties
  requiresTable?: boolean; // Does it need a crafting table?
  delta?: RecipeIngredient[]; // More detailed ingredient list sometimes? (Check mineflayer docs if needed)
}

// Define a type for Item Metadata, focusing on known properties
interface ItemMeta {
  id: number;
  count?: number;
  // metadata can be complex, potentially containing NBT data
  metadata?: unknown; // Keeping `unknown` here as NBT structure varies widely
  // Allow other potential properties, though id is the most reliably used one here
}

// <-- Added definition for MetadataSlotData
interface MetadataSlotData {
  id: number;
  // Potentially add other known fields if needed, e.g., count: number;
}

// Extend prismarine-entity's Entity type slightly for easier metadata access
// Note: Entity metadata structure is complex and version-dependent.
interface EntityAdditions {
  // Define metadata structure assumption - Keep it optional here as it might not always exist
  metadata?: (ItemMeta | object)[];
  // Add username for convenience (though checking entity.type === 'player' is safer)
  username?: string;
}
export interface IObserverOptions {
  radius?: number;
}

export class Observer {
  private bot: Bot;
  private radius: number;
  private sharedState: SharedAgentState;
  private mcData: minecraftData.IndexedData;
  private _wasHurt = false;
  private _swingArmAttacker: Entity | null = null;
  public recentChats: string[] = [];
  private itemMetadataIndex: number; // <-- Added declaration for class property

  constructor(
    bot: Bot,
    options: IObserverOptions = {},
    sharedState: SharedAgentState
  ) {
    this.bot = bot;
    this.radius = options.radius ?? 2000;
    this.sharedState = sharedState;

    const minecraftVersion = process.env.MINECRAFT_VERSION;
    if (minecraftVersion == undefined) {
      throw new Error("Minecraft Version is Undefined in .env");
    }
    // Clean the version string in case it has prefixes/suffixes
    // semver import fixes unsafe access errors here
    const cleanVersion = semver.coerce(minecraftVersion)?.version;
    if (!cleanVersion) {
      throw new Error(`Invalid Minecraft Version format: ${minecraftVersion}`);
    }

    // cleanVersion is now confirmed string, so this call is safe
    this.mcData = minecraftData(cleanVersion);

    // Determine the correct metadata index based on the version
    // semver import fixes unsafe access errors here
    if (semver.gte(cleanVersion, "1.19.0")) {
      this.itemMetadataIndex = 8; // <-- Assignment is now valid due to declaration
    } else {
      this.itemMetadataIndex = 7; // <-- Assignment is now valid due to declaration
    }
    console.log(
      `[Observer] Using item metadata index: ${this.itemMetadataIndex} for Minecraft version ${cleanVersion}`
    ); // <-- Access is now valid

    // Schedule periodic updates of the bot's inventory, health, and hunger.
    setInterval(() => {
      void this.updateFastBotStats();
    }, 2000);

    setInterval(() => {
      void this.updateSlowBotStats();
    }, 60000);

    // --- NEW: Chat Listener Logic ---
    this.bot.on("chat", (username: string, message: string) => {
      if (username === this.bot.username) return; // Ignore self

      let commandMessage: string = message;

      if (message.toLowerCase().startsWith("ab:")) {
        commandMessage = message.substring(3).trim();
      } else if (message.toLowerCase().startsWith("dbb:")) {
        commandMessage = message.substring(4).trim();
      } else if (message.toLowerCase().startsWith("all:")) {
        commandMessage = message.substring(4).trim();
      }
      // else: commandMessage remains the original message

      if (commandMessage.toLowerCase().startsWith("test ")) {
        return;
      }

      const formattedMessage = `${username}: ${message}`;
      this.recentChats.push(formattedMessage);
    });
  }

  // --- NEW: Method to get and clear chats ---
  public getAndClearRecentChats(): string[] {
    const chats = [...this.recentChats]; // Copy the array
    this.recentChats = []; // Clear the original array
    return chats;
  }

  /**
   * New method to update the shared state with current bot stats.
   */
  public async updateFastBotStats(): Promise<void> {
    void this.bot.waitForChunksToLoad();
    const inventory = this.getInventoryContents();
    this.sharedState.inventory = inventory;

    this.sharedState.botHealth = this.bot.health;
    this.sharedState.botHunger = this.bot.food;
    this.sharedState.botPosition = {
      x: this.bot.entity.position.x,
      y: this.bot.entity.position.y,
      z: this.bot.entity.position.z,
    };
    const equipped = this.getEquippedItems();
    this.sharedState.equippedItems = equipped;

    const mobs = await this.getVisibleMobs();
    this.sharedState.visibleMobs = mobs;

    const nearbyPlayers = this.getNearbyPlayers();
    this.sharedState.playersNearby = nearbyPlayers;
  }

  public async updateSlowBotStats(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve, 100));
    const blocks = await this.getVisibleBlockTypes();
    this.sharedState.visibleBlockTypes = blocks;
    await new Promise((resolve) => setImmediate(resolve, 100));
  }

  /**
   * Finds the closest position for each unique visible block type within the configured radius.
   */
  public async getVisibleBlockTypes(): Promise<{
    BlockTypes: Record<string, { x: number; y: number; z: number }>;
  }> {
    const botPos = this.bot.entity.position;
    await new Promise((resolve) => setImmediate(resolve, 100));
    const positions = this.bot.findBlocks({
      point: botPos,
      matching: (block: Block | null) => {
        if (!block) return false;
        // Allow sugar cane specifically, otherwise disallow air
        if (block.type === this.mcData.blocksByName.sugar_cane?.id) return true; // Use mcData for ID robustness
        return block.name !== "air";
      },
      maxDistance: this.radius,
      count: 999999, // Find all blocks in radius
    });

    // Use Vec3Type (which is Vec3) here
    const closestByType: Record<string, { distanceSq: number; pos: Vec3Type }> =
      {};

    let processedCount = 0;
    const yieldInterval = 10000;

    for (const pos of positions) {
      const block = this.bot.blockAt(pos);
      // Check if block exists and is not air (unless it's sugar cane, checked in matching)
      if (!block || block.name === "air") {
        continue; // Already filtered non-air (and sugar cane) in findBlocks matching, but double check doesn't hurt
      }

      const blockName = block.name;
      const existing = closestByType[blockName];
      let distanceSq: number;

      // Calculate distance only when needed
      if (!existing) {
        distanceSq = botPos.distanceSquared(pos);
        closestByType[blockName] = { distanceSq, pos };
      } else {
        // Calculate distance only if potentially closer
        // Optimization: Check squared distance against existing squared distance
        // This comparison is cheap. Calculating distanceSq is only needed if it *might* be smaller.
        // However, the current check is simple: always calculate and compare.
        // For extreme performance, you could compare bbox distance first.
        distanceSq = botPos.distanceSquared(pos);
        if (distanceSq < existing.distanceSq) {
          closestByType[blockName] = { distanceSq, pos };
        }
      }

      processedCount++;
      if (processedCount % yieldInterval === 0) {
        await new Promise((resolve) => setImmediate(resolve, 100));
      }
    }

    const result: {
      BlockTypes: Record<string, { x: number; y: number; z: number }>;
    } = { BlockTypes: {} };

    for (const blockName in closestByType) {
      const { pos } = closestByType[blockName];
      // Ensure pos has valid numeric coordinates before adding
      if (
        pos &&
        typeof pos.x === "number" &&
        typeof pos.y === "number" &&
        typeof pos.z === "number"
      ) {
        result.BlockTypes[blockName] = { x: pos.x, y: pos.y, z: pos.z };
      } else {
        console.warn(
          `[Observer ${this.bot.username}] Invalid position data for block type ${blockName}:`,
          pos
        );
      }
    }

    const typeCount = Object.keys(result.BlockTypes).length;
    if (typeCount < 10 && positions.length > 0) {
      console.warn(
        `[Observer] Warning: Found only ${typeCount} unique visible block types within radius ${this.radius}.`
      );
    }

    return result;
  }

  public async getVisibleMobs(): Promise<{
    Mobs: { name: string; distance: number }[];
  }> {
    await this.bot.waitForChunksToLoad();

    const center = this.bot.entity.position;
    const result = { Mobs: [] as { name: string; distance: number }[] };
    const currentVersion = process.env.MINECRAFT_VERSION;
    let itemMetaIndex = -1; // Default to invalid index

    // Determine the correct index based on the environment variable
    if (currentVersion) {
      try {
        // Compare current version with 1.19.0 using semver
        // semver import fixes unsafe access errors here
        if (
          semver.valid(currentVersion) &&
          semver.gte(currentVersion, "1.19.0")
        ) {
          itemMetaIndex = 8; // Use index 8 for 1.19+
        } else {
          itemMetaIndex = 7; // Use index 7 for versions before 1.19
        }
      } catch (e) {
        console.error(
          `[Observer] Error parsing MINECRAFT_VERSION '${currentVersion}'. Cannot determine item metadata index reliably.`,
          e
        );
        // Keep itemMetaIndex as -1 if parsing fails
      }
    } else {
      console.warn(
        "[Observer] MINECRAFT_VERSION environment variable not set. Cannot determine item metadata index."
      );
      // Keep itemMetaIndex as -1 if the variable is not set
    }

    for (const id in this.bot.entities) {
      // Cast to EntityWithMetadata for potential metadata access, handle null
      const entity = this.bot.entities[id] as (Entity & EntityAdditions) | null;

      if (!entity || entity === this.bot.entity || entity.type === "player") {
        continue;
      }

      const dist = center.distanceTo(entity.position);
      if (dist <= this.radius) {
        let mobName = entity.name ?? "unknown_mob";

        // Check specifically for dropped items and try to get specific item name
        // Use the determined index ONLY if it's valid (>= 0)
        // Metadata type is now (ItemMeta | object)[] | undefined
        if (
          itemMetaIndex >= 0 &&
          entity.name === "item" &&
          entity.metadata && // Check if metadata exists
          Array.isArray(entity.metadata) && // Check if it's an array
          entity.metadata.length > itemMetaIndex // Check if index is within bounds
        ) {
          const itemMetaCandidate: unknown = entity.metadata[itemMetaIndex];

          // --- Runtime Type Check ---
          if (
            itemMetaCandidate &&
            typeof itemMetaCandidate === "object" &&
            "id" in itemMetaCandidate &&
            typeof (itemMetaCandidate as Record<string, unknown>).id ===
              "number"
          ) {
            // --- Type Assertion ---
            // MetadataSlotData is now defined, assertion and access should be safe
            const itemMeta = itemMetaCandidate as MetadataSlotData;
            const itemData = this.mcData.items[itemMeta.id];
            if (itemData && itemData.name) {
              mobName = itemData.name;
            }
          }
          // --- End Runtime Check ---
        }
        // If itemMetaIndex is -1 (due to missing var or parsing error), this block is skipped,
        // and the mobName remains the default ('item' or 'unknown_mob').

        result.Mobs.push({
          name: mobName,
          distance: parseFloat(dist.toFixed(2)),
        });
      }
    }

    return result;
  }

  /**
   * ----------------------------
   * 2) Inventory Observation
   * ----------------------------
   */
  public getInventoryContents(): string[] {
    const items = this.bot.inventory.items();
    const itemStrings = items.map((item) => `${item.name}:${item.count}`);
    return [...itemStrings];
  }

  /**
   * New method to return what is equipped in the armor and offhand slots.
   */
  public getEquippedItems(): {
    head: string | null;
    chest: string | null;
    legs: string | null;
    feet: string | null;
    offhand: string | null;
  } {
    const headSlot = this.bot.getEquipmentDestSlot("head");
    const chestSlot = this.bot.getEquipmentDestSlot("torso");
    const legsSlot = this.bot.getEquipmentDestSlot("legs");
    const feetSlot = this.bot.getEquipmentDestSlot("feet");
    const offhandSlot = this.bot.getEquipmentDestSlot("off-hand");

    // Helper to format item slot, returns null if slot is empty
    const formatSlot = (slotIndex: number): string | null => {
      const item = this.bot.inventory.slots[slotIndex];
      return item ? `${item.name}:${item.count}` : null;
    };

    const head = formatSlot(headSlot);
    const chest = formatSlot(chestSlot);
    const legs = formatSlot(legsSlot);
    const feet = formatSlot(feetSlot);
    const offhand = formatSlot(offhandSlot);

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
    // Assuming bot.recipesAll returns Recipe[] or similar based on mineflayer usage
    const recipes: Recipe[] = this.bot.recipesAll(itemData.id, null, true);
    if (recipes.length === 0) {
      return `No crafting recipe found for "${itemName}".`;
    }
    let output = `Recipes for "${itemName}":\n`;
    recipes.forEach((recipe, idx) => {
      output += `  Recipe #${idx + 1} requires:\n`;

      // Determine ingredients based on recipe structure (shaped vs shapeless)
      let ingredients: RecipeIngredient[] = [];
      if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
        // Shapeless or already flattened
        ingredients = recipe.ingredients;
      } else if (recipe.inShape && Array.isArray(recipe.inShape)) {
        // Shaped recipe, flatten and filter nulls/invalid IDs (-1 often means empty slot)
        ingredients = recipe.inShape
          .flat()
          // Type the parameter here
          .filter(
            (ing: RecipeIngredient | null): ing is RecipeIngredient =>
              ing !== null && ing.id !== -1
          );
      }

      if (ingredients.length === 0) {
        output +=
          "    (No specific ingredients listed or recipe structure unknown)\n";
      } else {
        // Aggregate counts for ingredients
        const needed = new Map<number, number>();
        for (const ing of ingredients) {
          // Accessing ing.id and ing.count is now safe due to RecipeIngredient type
          needed.set(ing.id, (needed.get(ing.id) || 0) + ing.count);
        }

        // Format output
        for (const [ingId, ingCount] of needed.entries()) {
          const ingName =
            this.mcData.items[ingId]?.name || `unknown_item(id:${ingId})`; // Use ID if name not found
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

    // Assuming bot.recipesFor returns Recipe[]
    const recipes: Recipe[] = this.bot.recipesFor(itemData.id, null, 1, null);
    if (recipes.length === 0) return false;

    for (const recipe of recipes) {
      // Pass the correctly typed recipe
      if (this.hasAllIngredientsForRecipe(recipe)) {
        return true;
      }
    }
    return false;
  }

  // Type the recipe parameter
  private hasAllIngredientsForRecipe(recipe: Recipe): boolean {
    // Ensure recipe has ingredients defined (could be delta or ingredients)
    const ingredients = recipe.delta ?? recipe.ingredients;
    if (!ingredients || !Array.isArray(ingredients)) {
      console.warn(
        `[Observer] Recipe for ${
          recipe.result?.id ?? "unknown item" // Added fallback for result id
        } missing valid ingredients array.`
      );
      return false; // Cannot determine craftability without ingredients
    }

    const needed = new Map<number, number>();
    // Filter out negative counts (results) if using delta, otherwise just use ingredients
    const requiredIngredients = recipe.delta
      ? ingredients
          .filter((ing) => ing.count < 0)
          .map((ing) => ({ ...ing, count: -ing.count }))
      : ingredients;

    for (const ing of requiredIngredients) {
      // ing is RecipeIngredient, access is safe
      needed.set(ing.id, (needed.get(ing.id) || 0) + ing.count);
    }

    // Check if inventory has enough items
    const invCounts = new Map<number, number>();
    for (const slot of this.bot.inventory.items()) {
      invCounts.set(slot.type, (invCounts.get(slot.type) || 0) + slot.count);
    }

    for (const [reqId, reqCount] of needed.entries()) {
      const haveCount = invCounts.get(reqId) || 0;
      if (haveCount < reqCount) {
        return false; // Missing required ingredient
      }
    }
    return true; // All ingredients available
  }

  /**
   * ----------------------------
   * 5) Potential Craftability
   * ----------------------------
   */
  public canEventuallyCraftItem(itemName: string): boolean {
    const itemData = this.mcData.itemsByName[itemName];
    if (!itemData) return false;

    const recipes: Recipe[] = this.bot.recipesFor(itemData.id, null, 1, null);
    if (recipes.length === 0) return false;

    const virtualInventory = new Map<number, number>();
    for (const slot of this.bot.inventory.items()) {
      virtualInventory.set(
        slot.type,
        (virtualInventory.get(slot.type) || 0) + slot.count
      );
    }

    // Track visited recipes to prevent infinite loops in recursive checks
    const visitedRecipes = new Set<string>(); // Use a unique identifier for recipes if possible, e.g., result item ID + index

    for (const recipe of recipes) {
      const recipeId =
        recipe.result?.id?.toString() ?? Math.random().toString(); // Basic ID, might need improvement
      if (
        this.canCraftWithSubrecipes(
          recipe,
          new Map(virtualInventory), // Pass a copy for each branch
          visitedRecipes,
          recipeId
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private canCraftWithSubrecipes(
    recipe: Recipe, // Type the recipe
    inv: Map<number, number>,
    visited: Set<string>, // Use the unique ID set
    currentRecipeId: string
  ): boolean {
    if (visited.has(currentRecipeId)) {
      return false; // Already exploring this recipe path
    }
    visited.add(currentRecipeId);

    // Use delta if available, otherwise ingredients
    const ingredients = recipe.delta ?? recipe.ingredients;
    if (!ingredients || !Array.isArray(ingredients)) {
      visited.delete(currentRecipeId); // Backtrack visited
      return false;
    }
    const needed = new Map<number, number>();
    const requiredIngredients = recipe.delta
      ? ingredients
          .filter((ing) => ing.count < 0)
          .map((ing) => ({ ...ing, count: -ing.count }))
      : ingredients;

    for (const ing of requiredIngredients) {
      // ing is RecipeIngredient, access safe
      needed.set(ing.id, (needed.get(ing.id) || 0) + ing.count);
    }

    for (const [reqId, reqCount] of needed.entries()) {
      const haveCount = inv.get(reqId) || 0;
      if (haveCount < reqCount) {
        // Need to craft the missing amount
        const missingAmount = reqCount - haveCount;

        const subItemName = this.mcData.items[reqId]?.name;
        if (!subItemName) {
          visited.delete(currentRecipeId); // Backtrack
          return false; // Cannot craft if item data is missing
        }

        const subRecipes: Recipe[] = this.bot.recipesFor(
          reqId,
          null,
          1, // Check if *any* recipe exists first
          null
        );
        if (subRecipes.length === 0) {
          visited.delete(currentRecipeId); // Backtrack
          return false; // No recipe found for sub-component
        }

        let subCrafted = false;
        for (const subRecipe of subRecipes) {
          const subRecipeId =
            subRecipe.result?.id?.toString() ?? Math.random().toString();
          // Create a copy of the inventory for the recursive call
          const subInv = new Map(inv);
          // Create a copy of visited set for the recursive call
          const subVisited = new Set(visited);

          if (
            this.canCraftWithSubrecipes(
              subRecipe,
              subInv, // Pass copy
              subVisited, // Pass copy
              subRecipeId
            )
          ) {
            // If sub-recipe is craftable, calculate how many times we need to craft it
            const producedCount = subRecipe.result?.count ?? 1;
            if (producedCount <= 0) {
              console.warn(
                `[Observer] Sub-recipe for ${subItemName} produces non-positive amount (${producedCount}), skipping.`
              );
              continue; // Skip this recipe if it doesn't produce items
            }
            const timesToCraft = Math.ceil(missingAmount / producedCount);

            // Simulate crafting: Update the *original* inventory (inv)
            // Add the crafted item
            inv.set(
              reqId,
              (inv.get(reqId) || 0) + timesToCraft * producedCount
            );
            // Consume ingredients for the sub-recipe (this requires its own check/loop, complex!)
            // *** SIMPLIFICATION: For now, assume ingredients are magically available for sub-craft ***
            // A full implementation would recursively subtract sub-recipe ingredients here.

            // Check if we NOW have enough
            if ((inv.get(reqId) || 0) >= reqCount) {
              subCrafted = true;
              break; // Found a path to craft the needed sub-component
            } else {
              // This case implies the simulation logic might be incomplete
              console.warn(
                `[Observer] Crafted ${subItemName} via sub-recipe, but still insufficient. Check logic.`
              );
              // We potentially still found *a* way, even if count is off due to simulation limits
              subCrafted = true; // Mark as craftable anyway? Or keep false? Let's stick with true for now.
              break;
            }
          }
        }
        if (!subCrafted) {
          visited.delete(currentRecipeId); // Backtrack
          return false; // Could not find a way to craft the required sub-component
        }
      }
    }

    // If we successfully acquired or crafted all needed ingredients for *this* recipe
    visited.delete(currentRecipeId); // Backtrack successfully
    return true;
  }

  /**
   * ----------------------------
   * 6) Detailed Block View (New Method!)
   * ----------------------------
   */
  public async getAllBlocksInRadius(
    radius = 10
  ): Promise<{ name: string; x: number; y: number; z: number }[]> {
    await this.bot.waitForChunksToLoad();

    const center = this.bot.entity.position;
    const blockPositions = this.bot.findBlocks({
      point: center,
      // Match any block except air. findBlocks usually returns Vec3[]
      matching: (b: Block | null) => b !== null && b.name !== "air",
      maxDistance: radius,
      count: 99999, // Use a very large count
    });

    const results: { name: string; x: number; y: number; z: number }[] = [];

    for (const pos of blockPositions) {
      const block = this.bot.blockAt(pos);
      const blockName = block ? block.name : "unknown_block"; // Handle potential null block
      results.push({
        name: blockName,
        x: pos.x,
        y: pos.y,
        z: pos.z,
      });
    }

    return results;
  }

  /**
   * Checks whether the bot is being attacked.
   */
  public checkIfUnderAttack(): {
    isUnderAttack: boolean;
    attacker: Entity | null;
    message: string;
  } {
    let attacker: Entity | null = null;
    let isUnderAttack = false;
    let message = "";

    if (this._wasHurt) {
      isUnderAttack = true;
      attacker = this.findClosestMobWithinDistance(4); // Check for nearby hostile mobs
      message = `The bot has taken damage. Likely attacker nearby: ${
        attacker?.name ?? attacker?.displayName ?? "unknown entity" // Use displayName if available
      }.`;
    }

    if (this._swingArmAttacker) {
      if (!isUnderAttack) {
        // Prioritize hurt message if both happened
        isUnderAttack = true;
        attacker = this._swingArmAttacker;
        message = `Entity ${
          attacker?.name ?? attacker?.displayName ?? "unknown"
        } is swinging its arm near the bot.`;
      } else if (!attacker) {
        // If hurt but no close mob found, attribute to swing arm attacker
        attacker = this._swingArmAttacker;
        message += ` Possible attacker (swinging arm): ${
          attacker?.name ?? attacker?.displayName ?? "unknown"
        }.`;
      }
    }

    // Check for nearby mobs even if not hurt/swinging, as a proactive measure
    if (!isUnderAttack) {
      const closeMob = this.findClosestMobWithinDistance(4);
      if (closeMob) {
        isUnderAttack = true;
        attacker = closeMob;
        message = `Potential threat: Hostile mob (${
          attacker.name ?? attacker.displayName ?? "unknown"
        }) is within 4 blocks.`;
      }
    }

    if (!isUnderAttack) {
      message = "The bot is not currently under attack.";
    }

    // Reset flags for the next check cycle
    this._wasHurt = false;
    this._swingArmAttacker = null;

    return { isUnderAttack, attacker, message };
  }

  /**
   * Helper to find the closest hostile mob within a certain distance.
   */
  private findClosestMobWithinDistance(maxDist: number): Entity | null {
    let nearestMob: Entity | null = null;
    let nearestDistSq = maxDist * maxDist; // Compare squared distances

    for (const id in this.bot.entities) {
      const e = this.bot.entities[id];
      // Use the isHostileMob helper function for clarity
      if (this.isHostileMob(e)) {
        // Checks for null, self, player, item type, and hostility
        if (e.position) {
          // Ensure position exists
          const distSq = this.bot.entity.position.distanceSquared(e.position);
          if (distSq <= nearestDistSq) {
            nearestDistSq = distSq;
            nearestMob = e;
          }
        }
      }
    }

    return nearestMob;
  }

  /**
   * Decide if an entity is a known hostile mob.
   */
  private isHostileMob(entity: Entity | null): entity is Entity {
    // Type predicate improves checks
    if (!entity || entity === this.bot.entity) return false;

    // Skip players using the safer type check
    if (entity.type === "player") return false;

    // Skip item entities
    if (entity.name === "item" || entity.type === "object") {
      // Items can sometimes be 'object' type
      // Further check if it's an item drop specifically if needed, e.g., by checking metadata
      return false;
    }

    // Compare against the set of known hostile mob names
    const entityName = entity.name?.toLowerCase() ?? "";
    return hostileMobNames.has(entityName);
  }

  /**
   * Returns a list of usernames of nearby players (excluding the bot itself).
   */
  public getNearbyPlayers(): string[] {
    try {
      const players = Object.values(this.bot.players)
        .filter((p) => p?.entity && p.username !== this.bot.username) // Simpler filter
        // Ensure username exists before mapping
        .map((p) => p.username)
        .filter((username): username is string => typeof username === "string"); // Ensure all mapped values are strings

      return players;
    } catch (error) {
      console.error(
        `[Observer] Error getting nearby players for ${this.bot.username}:`,
        error
      );
      return []; // Return empty array on error
    }
  }
}
