// src/observer.ts
import { strict as assert } from 'assert';
import dotenv from 'dotenv';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import type { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';
import { hostileMobNames } from '../../data/mobs';
import { SharedAgentState } from '../sharedAgentState';
dotenv.config(); // Ensure worker loads environment variables

export interface IObserverOptions {
  radius?: number;
}

interface BlockResult {
  BlockTypes: Record<string, { x: number; y: number; z: number }>;
}

type Vec3Type = Vec3;

export class Observer {
  private bot: Bot;
  private radius: number;
  private sharedState: SharedAgentState;
  private mcData: minecraftData.IndexedData;
  private _wasHurt = false;
  private _swingArmAttacker: Entity | null = null;
  public recentChats: string[] = [];
  constructor(
    bot: Bot,
    options: IObserverOptions = {},
    sharedState: SharedAgentState
  ) {
    this.bot = bot;
    this.radius = options.radius ?? 2000;
    this.sharedState = sharedState;

    if (process.env.MINECRAFT_VERSION == undefined) {
      throw new Error('Minecraft Version is Undefined');
    }
    this.mcData = minecraftData(process.env.MINECRAFT_VERSION);

    // Schedule periodic updates of the bot's inventory, health, and hunger.
    setInterval(() => {
      this.updateFastBotStats();
    }, 2000);

    setInterval(() => {
      this.updateSlowBotStats();
    }, 60000);

    // console.log(`[Observer ${this.bot.username}] Scheduling comparison test in 30 seconds.`);
    // setTimeout(() => {
    //   this.runComparisonTest().catch(err => {
    //     console.error(`[Observer ${this.bot.username}] Error during comparison test:`, err);
    //   });
    // }, 40000); // 60,000 ms = 1 minute

    // --- NEW: Chat Listener Logic ---
    this.bot.on('chat', (username: string, message: string) => {
      if (username === this.bot.username) return; // Ignore self

      let commandMessage: string = message;
      let isPrefixed = false;

      // Basic prefix parsing (similar to botWorker's original logic)
      // to isolate the actual message content for the 'test ' check.
      if (message.toLowerCase().startsWith('ab:')) {
        commandMessage = message.substring(3).trim();
        isPrefixed = true;
      } else if (message.toLowerCase().startsWith('dbb:')) {
        commandMessage = message.substring(4).trim();
        isPrefixed = true;
      } else if (message.toLowerCase().startsWith('all:')) {
        commandMessage = message.substring(4).trim();
        isPrefixed = true;
      }
      // else: commandMessage remains the original message

      // Ignore messages that are test commands (after handling prefix)
      if (commandMessage.toLowerCase().startsWith('test ')) {
        // console.log(`[Observer ${this.bot.username}] Ignoring test command chat: ${username}: ${message}`); // Optional debug log
        return;
      }

      // Store the original, non-test message
      const formattedMessage = `${username}: ${message}`;
      this.recentChats.push(formattedMessage);
      // Optional: Limit the size of recentChats array
      // if (this.recentChats.length > 20) {
      //     this.recentChats.shift(); // Remove oldest message
      // }
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
    //console.log("this is inventory: ", inventory);
    this.sharedState.inventory = inventory;
    //console.log("this is sharedstate inv: ", this.sharedState.inventory);

    // Assumes mineflayer bot has properties "health" and "food"
    this.sharedState.botHealth = this.bot.health;
    this.sharedState.botHunger = this.bot.food;
    // Update bot position as well
    //console.log(`[Observer] ${this.bot.username} Pos:`, this.bot.entity.position);
    this.sharedState.botPosition = {
      x: this.bot.entity.position.x,
      y: this.bot.entity.position.y,
      z: this.bot.entity.position.z,
    };
    // Update equipped items from bot's current equipment.
    const equipped = this.getEquippedItems();
    this.sharedState.equippedItems = equipped;

    // Update visible mobs
    const mobs = await this.getVisibleMobs();
    this.sharedState.visibleMobs = mobs;

    const nearbyPlayers = this.getNearbyPlayers();
    this.sharedState.playersNearby = nearbyPlayers;

    //console.log("fastBotStat update time: ", fastbotStatEndTime - fastbotStatStartTime)
  }

  public async updateSlowBotStats(): Promise<void> {
  //   const slowStart = Date.now()
  //   console.log("slowBotStat started")
    await new Promise((resolve) => setImmediate(resolve, 100));
    const blocks = await this.getVisibleBlockTypes();
    this.sharedState.visibleBlockTypes = blocks;
    await new Promise((resolve) => setImmediate(resolve, 100));
  //   const slowEnd = Date.now()
  //  console.log("slowBotStat update time: ", slowEnd - slowStart);
  }

  // private async runComparisonTest(): Promise<void> {
  //   console.log(
  //     `\n--- [Observer ${this.bot.username}] STARTING BLOCK SCAN COMPARISON TEST (Radius: ${this.radius}) ---`
  //   );
  //   let originalResult: BlockResult | null = null;
  //   let chunkedResult: BlockResult | null = null;
  //   let errorOccurred: boolean = false;
  //   this.bot.waitForChunksToLoad();
  //   // Run Original Scan
  //   try {
  //     originalResult = await this.getVisibleBlockTypes();
  //   } catch (err) {
  //     console.error(
  //       `[Observer ${this.bot.username}] Comparison Test: Error during ORIGINAL scan:`,
  //       err
  //     );
  //     errorOccurred = true;
  //   }

  //   // Run Chunked Scan
  //   try {
  //     chunkedResult = await this.getVisibleBlockTypesChunked();
  //   } catch (err) {
  //     console.error(
  //       `[Observer ${this.bot.username}] Comparison Test: Error during CHUNKED scan:`,
  //       err
  //     );
  //     errorOccurred = true;
  //   }

  //   // Compare Results
  //   if (errorOccurred) {
  //     console.log(
  //       `--- [Observer ${this.bot.username}] COMPARISON TEST FAILED due to error during scans. ---`
  //     );
  //     return;
  //   }

  //   if (!originalResult || !chunkedResult) {
  //     console.log(
  //       `--- [Observer ${this.bot.username}] COMPARISON TEST FAILED: One or both results are null/undefined. ---`
  //     );
  //     return;
  //   }

  //   try {
  //     // Use Node.js assert.deepStrictEqual for a robust comparison
  //     // This compares keys, values, and structure recursively.
  //     assert.deepStrictEqual(
  //       originalResult.BlockTypes,
  //       chunkedResult.BlockTypes,
  //       "BlockTypes objects do not match."
  //     );

  //     // If assert doesn't throw, they are equal
  //     console.log(
  //       `--- [Observer ${
  //         this.bot.username
  //       }] COMPARISON TEST PASSED: Results are identical. (${
  //         Object.keys(originalResult.BlockTypes).length
  //       } types found) ---`
  //     );
  //   } catch (assertionError: any) {
  //     // Assert threw an error, meaning they are different
  //     console.error(
  //       `--- [Observer ${this.bot.username}] COMPARISON TEST FAILED: Results differ! ---`
  //     );
  //     console.error("Assertion Error:", assertionError.message);

  //     // Optional: Log detailed differences (more complex)
  //     const originalKeys = Object.keys(originalResult.BlockTypes).sort();
  //     const chunkedKeys = Object.keys(chunkedResult.BlockTypes).sort();
  //     if (originalKeys.join(",") !== chunkedKeys.join(",")) {
  //       console.error("Different block types found:");
  //       console.error(
  //         "  Original Only:",
  //         originalKeys.filter((k) => !chunkedResult!.BlockTypes[k])
  //       );
  //       console.error(
  //         "  Chunked Only:",
  //         chunkedKeys.filter((k) => !originalResult!.BlockTypes[k])
  //       );
  //     } else {
  //       console.log("Same block types found, checking positions...");
  //       for (const key of originalKeys) {
  //         const posO = originalResult.BlockTypes[key];
  //         const posC = chunkedResult.BlockTypes[key];
  //         if (posO.x !== posC.x || posO.y !== posC.y || posO.z !== posC.z) {
  //           console.error(
  //             `  Position mismatch for ${key}: Original=(${posO.x},${posO.y},${posO.z}), Chunked=(${posC.x},${posC.y},${posC.z})`
  //           );
  //         }
  //       }
  //     }
  //     console.log("----------------------------------------------------");
  //   }
  //   console.log(
  //     `--- [Observer ${this.bot.username}] COMPARISON TEST FINISHED ---`
  //   );
  // }

  /**
   * ------------------------------
   * 1) Visible Environment Methods
   * ------------------------------
   */
  /**
   * Finds the closest position for each unique visible block type within the configured radius,
   * by scanning the area in smaller chunks and yielding between chunks.
   */
  /**
   * ------------------------------
   * 1) Visible Environment Methods
   * ------------------------------
   */
  /**
   * Finds the closest position for each unique visible block type within the configured radius,
   * by scanning the area in smaller chunks and yielding between chunks.
   */
  // private async getVisibleBlockTypesChunked(
  //   chunkSize: number = 32, // Using 64 based on previous test results showing good balance
  //   internalCount: number = 999999 // Keep high count for accuracy
  // ): Promise<{
  //   BlockTypes: { [blockName: string]: { x: number; y: number; z: number } };
  // }> {
  //   const botPos = this.bot.entity.position;
  //   if (!botPos) {
  //     console.warn(
  //       `[Observer: ${this.bot.username}] Cannot perform chunked scan: Bot position unknown.`
  //     );
  //     return { BlockTypes: {} };
  //   }

  //   // --- Performance Timers ---
  //   const overallStartTime = Date.now();
  //   let totalAABBCheckTime = 0;
  //   let totalFindBlocksTime = 0;
  //   let totalBlockProcessingTime = 0;
  //   // --------------------------

  //   const scanRadius = this.radius;
  //   const scanRadiusSq = scanRadius * scanRadius;

  //   const closestByType = new Map<
  //     string,
  //     { distanceSq: number; pos: Vec3Type }
  //   >();
  //   let totalPositionsFound = 0;
  //   let chunksScanned = 0;
  //   let skippedChunks = 0; // Track skipped chunks

  //   const maxOffset = Math.ceil(scanRadius / chunkSize) * chunkSize;

  //   console.log(
  //     `[Observer: ${this.bot.username}] Chunked scan starting: Radius=${scanRadius}, ChunkSize=${chunkSize}, MaxOffset=${maxOffset}`
  //   );

  //   const loopStartTime = Date.now(); // Time before loops start

  //   // Loop through chunks in 3D space around the bot
  //   for (let dx = -maxOffset; dx < maxOffset; dx += chunkSize) {
  //     for (let dy = -maxOffset; dy < maxOffset; dy += chunkSize) {
  //       for (let dz = -maxOffset; dz < maxOffset; dz += chunkSize) {
  //         const chunkCenterRel = new Vec3(
  //           dx + chunkSize / 2,
  //           dy + chunkSize / 2,
  //           dz + chunkSize / 2
  //         );

  //         // --- Measure AABB Check ---
  //         const aabbStartTime = Date.now();
  //         let distSqToChunk = 0;
  //         for (const axis of ["x", "y", "z"] as const) {
  //           const botAxis = botPos[axis];
  //           const chunkMin =
  //             botPos[axis] + chunkCenterRel[axis] - chunkSize / 2;
  //           const chunkMax =
  //             botPos[axis] + chunkCenterRel[axis] + chunkSize / 2;
  //           if (botAxis < chunkMin)
  //             distSqToChunk += (chunkMin - botAxis) * (chunkMin - botAxis);
  //           else if (botAxis > chunkMax)
  //             distSqToChunk += (botAxis - chunkMax) * (botAxis - chunkMax);
  //         }
  //         totalAABBCheckTime += Date.now() - aabbStartTime;
  //         // --------------------------

  //         if (distSqToChunk > scanRadiusSq) {
  //           skippedChunks++; // Increment skipped chunk count
  //           continue; // This chunk is entirely outside the radius sphere
  //         }

  //         const searchPoint = botPos.plus(chunkCenterRel);
  //         const searchDistance = (Math.sqrt(3) / 2) * chunkSize * 1.01;

  //         let positionsInChunk: Vec3[] = [];
  //         let findBlocksDuration = 0; // Timer for this specific call
  //         try {
  //           // --- Measure findBlocks ---
  //           const findBlocksStartTime = Date.now();
  //           positionsInChunk = this.bot.findBlocks({
  //             point: searchPoint,
  //             maxDistance: searchDistance,
  //             matching: (block: Block | null): boolean => {
  //               // Check for null block
  //               // Need to handle null block case potentially returned by matching fn
  //               if (!block) return false; // If block is null, it cannot match
  //               // Original logic: not air OR sugar cane (type 265)
  //               return block.name !== "air" || block.type === 265;
  //             },
  //             count: internalCount,
  //             useExtraInfo: false, // Kept false for potential minor perf gain
  //           });
  //           findBlocksDuration = Date.now() - findBlocksStartTime;
  //           totalFindBlocksTime += findBlocksDuration;
  //           // ------------------------
  //         } catch (findBlocksError) {
  //           console.error(
  //             `[Observer: ${this.bot.username}] Error during findBlocks in chunk centered near ${searchPoint}:`,
  //             findBlocksError
  //           );
  //           await new Promise((resolve) => setImmediate(resolve, 100)); // Yield even on error
  //           continue;
  //         }

  //         chunksScanned++;
  //         totalPositionsFound += positionsInChunk.length;

  //         // --- Measure Block Processing ---
  //         const processingStartTime = Date.now();
  //         for (const pos of positionsInChunk) {
  //           const distSqFromBot = pos.distanceSquared(botPos);
  //           if (distSqFromBot > scanRadiusSq) {
  //             continue;
  //           }

  //           // Reduced blockAt calls by checking existing map first? - No, need name.
  //           const block = this.bot.blockAt(pos);
  //           // Added explicit check for null block before accessing name
  //           if (!block || block.name === "air") continue;

  //           const blockName = block.name;
  //           const existing = closestByType.get(blockName);

  //           if (!existing || distSqFromBot < existing.distanceSq) {
  //             closestByType.set(blockName, { distanceSq: distSqFromBot, pos });
  //           }
  //         }
  //         totalBlockProcessingTime += Date.now() - processingStartTime;
  //         // ------------------------------

  //         // Yield AFTER processing each chunk's results
  //         await new Promise((resolve) => setImmediate(resolve, 100));
  //       } // End dz loop
  //     } // End dy loop
  //   } // End dx loop

  //   const loopEndTime = Date.now(); // Time after loops finish

  //   // --- Log Performance ---
  //   const totalLoopTime = loopEndTime - loopStartTime;
  //   const otherLoopTime =
  //     totalLoopTime -
  //     (totalAABBCheckTime + totalFindBlocksTime + totalBlockProcessingTime);
  //   console.log(
  //     `[Observer: ${this.bot.username}] Chunk Scan Performance Breakdown:`
  //   );
  //   console.log(`  - Total Loop Iteration Time: ${totalLoopTime}ms`);
  //   console.log(`    - AABB Check Time:         ${totalAABBCheckTime}ms`);
  //   console.log(`    - findBlocks Time:         ${totalFindBlocksTime}ms`);
  //   console.log(`    - Block Processing Time:   ${totalBlockProcessingTime}ms`);
  //   console.log(`    - Other (Loop/Yield/Etc):  ${otherLoopTime}ms`);
  //   console.log(
  //     `  - Chunks Scanned: ${chunksScanned}, Chunks Skipped (AABB): ${skippedChunks}`
  //   );
  //   console.log(`  - Total Block Positions Found: ${totalPositionsFound}`);
  //   // ---------------------

  //   // --- Measure Result Formatting ---
  //   const formatStartTime = Date.now();
  //   const result: BlockResult = { BlockTypes: {} };
  //   for (const [blockName, { pos }] of closestByType.entries()) {
  //     if (
  //       pos &&
  //       typeof pos.x === "number" &&
  //       typeof pos.y === "number" &&
  //       typeof pos.z === "number"
  //     ) {
  //       result.BlockTypes[blockName] = { x: pos.x, y: pos.y, z: pos.z };
  //     } else {
  //       console.warn(
  //         `[Observer ${this.bot.username}] Invalid position data for block type ${blockName}`
  //       );
  //     }
  //   }
  //   const formatEndTime = Date.now();
  //   const formatDuration = formatEndTime - formatStartTime;
  //   // -----------------------------

  //   const typeCount = Object.keys(result.BlockTypes).length;
  //   const overallEndTime = Date.now();
  //   const overallDuration = overallEndTime - overallStartTime;

  //   console.log(
  //     `[Observer: ${this.bot.username}] Final Result Formatting Time: ${formatDuration}ms`
  //   );
  //   console.log(
  //     `[Observer ${this.bot.username}] Chunked scan final result includes ${typeCount} types. (Overall Time: ${overallDuration}ms)`
  //   );
  //   return result;
  // }

  // ... (rest of the Observer class remains the same)

  /**
   * Finds the closest position for each unique visible block type within the configured radius.
   */
  public async getVisibleBlockTypes(): Promise<{
    BlockTypes: Record<string, { x: number; y: number; z: number }>;
  }> {
    const botPos = this.bot.entity.position;
    const startTime = Date.now();
    await new Promise((resolve) => setImmediate(resolve, 100));
    const positions = this.bot.findBlocks({
      point: botPos,
      matching: (block: Block | null) => {
        if (!block) return false;
        if (block.type === 265) return true;
        return block.name !== 'air';
      },
      maxDistance: this.radius,
      count: 999999, // Find all blocks in radius
    });
    // const findBlocksTime = Date.now();
    // console.log(
    //   `[Observer: ${this.bot.username}] findBlocks found ${
    //     positions.length
    //   } raw positions within ${this.radius} blocks. (Took ${
    //     findBlocksTime - startTime
    //   }ms)`
    // );

    const closestByType: Record<string, { distanceSq: number; pos: Vec3Type }> = {};

    // --- YIELDING LOGIC ADDED ---
    let processedCount = 0;
    // Adjust this interval as needed. Higher means less frequent yielding (potentially more blocking).
    // Lower means more frequent yielding (less blocking, but slightly more overhead).
    const yieldInterval = 10000; // Yield every 1000 blocks processed

    for (const pos of positions) {
      const block = this.bot.blockAt(pos);
      if (!block || (block.name === 'air' && block.type !== 265)) {
        continue;
      }

      const blockName = block.name;
      const existing = closestByType[blockName];
      let distanceSq: number;

      if (!existing) {
        distanceSq = botPos.distanceSquared(pos);
        closestByType[blockName] = { distanceSq, pos };
      } else {
        distanceSq = botPos.distanceSquared(pos);
        if (distanceSq < existing.distanceSq) {
          closestByType[blockName] = { distanceSq, pos };
        }
      }

      // --- Add the yield check ---
      processedCount++;
      if (processedCount % yieldInterval === 0) {
        // Force a yield to the event loop
        //console.log(`[Observer ${this.bot.username}] Yielding block processing at ${processedCount}...`); // Optional log
        await new Promise((resolve) => setImmediate(resolve, 100));
      }
      // --- End yield check ---
    }
    // --- END YIELDING LOGIC ---
    const processingTime = Date.now();
    // console.log(
    //   `[Observer: ${this.bot.username}] Processed ${
    //     positions.length
    //   } positions to find closest types. (Took ${
    //     processingTime - findBlocksTime
    //   }ms)`
    // );

    // Step 3: Format the result (O(M) complexity - negligible)
    const result: {
      BlockTypes: Record<string, { x: number; y: number; z: number }>;
    } = { BlockTypes: {} };

    for (const blockName in closestByType) {
      const { pos } = closestByType[blockName];
      result.BlockTypes[blockName] = { x: pos.x, y: pos.y, z: pos.z };
    }

    // Step 4: Final logging and return
    const typeCount = Object.keys(result.BlockTypes).length;
    if (typeCount < 10 && positions.length > 0) {
      // This warning is less indicative of a problem now, as we searched everything in the radius
      console.warn(
        `[Observer] Warning: Found only ${typeCount} unique visible block types within radius ${this.radius}.`
      );
    }

    const endTime = Date.now();
    // console.log(
    //   `[Observer: ${
    //     this.bot.username
    //   }] Final result includes ${typeCount} types: ${Object.keys(
    //     result.BlockTypes
    //   ).join(", ")}. (Total time: ${endTime - startTime}ms) \n`
    // );
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
      const entity = this.bot.entities[id];
      if (!entity || entity === this.bot.entity || (entity as any).username)
        continue;
      const dist = center.distanceTo(entity.position);
      if (dist <= this.radius) {
        // Default to entity.name or "unknown_mob"
        let mobName = entity.name ?? 'unknown_mob';

        // If the entity is a dropped item, try to extract the actual item name.
        if (
          mobName === 'item' &&
          (entity as any).metadata &&
          (entity as any).metadata[7]
        ) {
          const itemMeta = (entity as any).metadata[7];
          // Check if itemMeta is an object with an id property
          if (
            itemMeta &&
            typeof itemMeta === 'object' &&
            itemMeta.id !== undefined
          ) {
            const itemData = this.mcData.items[itemMeta.id];
            if (itemData && itemData.name) {
              mobName = itemData.name;
            }
          }
        }

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
    // const header = `Empty slots: ${emptySlots}`;
    const itemStrings = items.map((item) => `${item.name}:${item.count}`);
    return [...itemStrings];
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
    const headSlot = this.bot.getEquipmentDestSlot('head');
    const chestSlot = this.bot.getEquipmentDestSlot('torso'); // Chestplate
    const legsSlot = this.bot.getEquipmentDestSlot('legs');
    const feetSlot = this.bot.getEquipmentDestSlot('feet');
    const offhandSlot = this.bot.getEquipmentDestSlot('off-hand');

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
        output += '    (No ingredients available)\n';
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

  /**
   * ----------------------------
   * 6) Detailed Block View (New Method!)
   * ----------------------------
   * Returns a list of every block (including air) within the specified radius.
   */
  public async getAllBlocksInRadius(
    radius = 10
  ): Promise<{ name: string; x: number; y: number; z: number }[]> {
    await this.bot.waitForChunksToLoad();

    const center = this.bot.entity.position;
    // We pick a large count to ensure we collect all blocks in a 10-block radius.
    const blockPositions = this.bot.findBlocks({
      point: center,
      matching: (b) => b && b.name !== 'air', // includes only non-air blocks
      maxDistance: radius,
      count: 9999,
    });

    const results: { name: string; x: number; y: number; z: number }[] = [];

    for (const pos of blockPositions) {
      const block = this.bot.blockAt(pos);
      // block can be null if chunk is not loaded, but we waited above
      const blockName = block ? block.name : 'unknown';
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
   * Checks whether the bot is being attacked based on three conditions:
   * 1. The bot has taken damage (entityHurt).
   * 2. A mob is within 4 blocks of the bot (nearestEntity).
   * 3. A mob is swinging its arm (entitySwingArm) near the bot (<= 4 blocks).
   *
   * Returns an object containing:
   *   - isUnderAttack: boolean
   *   - attacker: the entity that is attacking the bot, if any
   *   - message: an alert message detailing the situation
   */
  public checkIfUnderAttack(): {
    isUnderAttack: boolean;
    attacker: Entity | null;
    message: string;
  } {
    let attacker: Entity | null = null;
    let isUnderAttack = false;
    let message = '';

    // If the bot was hurt, mark it as under attack
    if (this._wasHurt) {
      isUnderAttack = true;
      // We’ll guess the attacker by checking the nearest mob within 4 blocks
      attacker = this.findClosestMobWithinDistance(4);
      message = `The bot has taken damage. Likely attacked by ${
        attacker?.name ?? 'unknown entity'
      }.`;
    }

    // If an entity swung its arm close by, that entity is a strong candidate
    if (this._swingArmAttacker) {
      isUnderAttack = true;
      attacker = this._swingArmAttacker;
      message = `Mob ${attacker?.name} is swinging its arm near the bot.`;
    }

    // Check if there’s a mob within 4 blocks. If so, we consider that an attack scenario too.
    const closeMob = this.findClosestMobWithinDistance(4);
    if (closeMob) {
      isUnderAttack = true;
      attacker = closeMob;
      if (!message) {
        message = `There is a mob (${attacker.name}) within 4 blocks, might be attacking the bot.`;
      }
    }

    // If none of the above triggered, the bot isn’t under attack
    if (!isUnderAttack) {
      message = 'The bot is not currently under attack.';
    }

    // Reset flags so we only report once per check
    this._wasHurt = false;
    this._swingArmAttacker = null;

    return { isUnderAttack, attacker, message };
  }

  /**
   * Helper to find the closest non-player entity within a certain distance
   */
  private findClosestMobWithinDistance(maxDist: number): Entity | null {
    let nearestMob: Entity | null = null;
    let nearestDist = Infinity;

    for (const id in this.bot.entities) {
      const e = this.bot.entities[id];
      if (!this.isHostileMob(e)) continue;

      if (!e || e === this.bot.entity) continue;

      // Skip players
      if ((e as any).username) continue;
      if (e.position) {
        const dist = this.bot.entity.position.distanceTo(e.position);
        if (dist <= maxDist && dist < nearestDist) {
          nearestDist = dist;
          nearestMob = e;
        }
      }
    }

    return nearestMob;
  }

  /**
   * Decide if an entity is a known hostile mob (e.g., zombie, skeleton).
   * Skips players, items, and anything not recognized as hostile.
   */
  private isHostileMob(entity: Entity | null): boolean {
    if (!entity || entity === this.bot.entity) return false;

    // Skip players (they have a `username`)
    if ((entity as any).username) return false;

    // Skip item entities
    if (entity.name === 'item') return false;

    // Compare against the set
    const entityName = entity.name?.toLowerCase() ?? '';
    return hostileMobNames.has(entityName);
  }

  /**
   * Returns a list of usernames of nearby players (excluding the bot itself).
   * @returns {string[]} An array of player usernames.
   */
  public getNearbyPlayers(): string[] {
    // Added explicit return type
    try {
      // Added try/catch
      const players = Object.values(this.bot.players).filter(
        (p) =>
          p?.entity && // Check if player and entity exist
          p.entity.type === 'player' &&
          p.username !== this.bot.username
      );
      return players.map((p) => p.username);
    } catch (error) {
      console.error(
        `[Observer] Error getting nearby players for ${this.bot.username}:`,
        error
      );
      return []; // Return empty array on error
    }
  }
}
