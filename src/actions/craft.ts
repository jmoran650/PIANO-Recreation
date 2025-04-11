// ==================================================
// File: src/actions/craft.ts (Modified)
// ==================================================
import dotenv from 'dotenv';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';
import { Navigation } from '../navigation';
import { Observer } from '../observer/observer';
import { SharedAgentState } from '../sharedAgentState';
import {
  findNearbyPlacedTable,
  findSafePlacement,
  checkPlacementPossible,
  sleep, // Assuming sleep is imported or available
} from './helpers/helpers'; // Ensure sleep is available here or import from utils/sleep

dotenv.config();

export class CraftingService {
  private bot: Bot;
  private navigation: Navigation;
  private mcData: any;
  private sharedState: SharedAgentState;
  private observer: Observer;
  public readonly INTERACTION_RANGE = 4.5; // Range for immediate use
  private readonly TABLE_SEARCH_RANGE = 16; // Extended range for finding existing tables

  constructor(
    bot: Bot,
    navigation: Navigation,
    sharedState: SharedAgentState,
    observer: Observer
  ) {
    this.bot = bot;
    this.navigation = navigation;
    this.sharedState = sharedState;
    this.observer = observer; // Observer is needed for inventory checks in error messages

    const version = process.env.MINECRAFT_VERSION || bot.version; // Get version safely
    if (!version) {
      throw new Error(
        '[CraftingService] Minecraft Version Undefined and not available from bot'
      );
    }
    this.mcData = minecraftData(version);
    if (!this.mcData) {
      throw new Error(
        `[CraftingService] Failed to load minecraft-data for version ${version}`
      );
    }
  }

  /**
   * Crafts a specified item, finding/placing a crafting table internally if needed (based on heuristic).
   * @param goalItem The name of the item to craft.
   */
  public async craft(goalItem: string): Promise<void> {
    this.sharedState.addPendingAction(`Craft ${goalItem}`);
    console.log(`[CraftingService] Attempting to craft ${goalItem}...`);

    const itemData = this.mcData.itemsByName[goalItem];
    if (!itemData) {
      throw new Error(`[CraftingService] Item data not found for: ${goalItem}`);
    }
    const itemId = itemData.id;

    let tableReference: Block | null = null;

    // Heuristic: Check if a table might be needed (exclude planks and crafting table itself)
    const potentiallyNeedsTable: boolean =
      !goalItem.endsWith('_planks') &&
      goalItem !== 'crafting_table' &&
      goalItem !== 'stick';
    if (potentiallyNeedsTable) {
      console.log(
        `[CraftingService] Item "${goalItem}" might require a crafting table. Searching/placing...`
      );
      tableReference = await this.findCraftingTable(); // Use the new helper

      // Check if table was needed *and* could not be secured
      if (!tableReference) {
        const allRecipesCheck = this.bot.recipesAll(itemId, null, null);
        const trulyNeedsTable = allRecipesCheck.some(
          (r: any) => r.requiresTable
        );

        if (trulyNeedsTable) {
          console.error(
            `[CraftingService] Crafting table confirmed necessary for ${goalItem}, but could not be found or placed.`
          );
          throw new Error(
            `[CraftingService] Crafting table required for ${goalItem}, but none could be found or placed.`
          );
        } else {
          console.log(
            `[CraftingService] Heuristic suggested table needed for ${goalItem}, but recipesAll confirmed none required. Proceeding without table.`
          );
          // tableReference remains null, which is correct
        }
      } else {
        console.log(
          `[CraftingService] Secured crafting table at ${tableReference.position} for potential use.`
        );
      }
    } else {
      console.log(
        `[CraftingService] Item "${goalItem}" identified as likely not needing a table (planks or table itself). Skipping table search.`
      );
    }

    // Recipe Check & Crafting Attempt (Uses the tableReference if found/placed)
    console.log(
      `[DEBUG Craft] Calling recipesFor(${itemId}, null, 1, ${
        tableReference ? 'tableReference' : 'null'
      })`
    );
    // *** Use the potentially acquired tableReference here ***
    const possibleRecipesFor = this.bot.recipesFor(
      itemId,
      null,
      1,
      tableReference
    );

    if (!possibleRecipesFor || possibleRecipesFor.length === 0) {
      // Enhanced Diagnostics
      let reason = `Cannot craft ${goalItem}: No recipes found matching current inventory`;
      const allRecipesWithTable = this.bot.recipesAll(
        itemId,
        null,
        tableReference
      ); // Check all recipes with the current table setup
      const allRecipesWithoutTable = this.bot.recipesAll(itemId, null, null); // Check all recipes without any table

      if (allRecipesWithTable.length > 0 || allRecipesWithoutTable.length > 0) {
        // If recipes exist *in general* but recipesFor failed, it's missing ingredients
        reason = `Cannot craft ${goalItem}: Missing ingredients.`;
        // Log required ingredients for the first possible recipe
        const firstRecipe = allRecipesWithTable[0] || allRecipesWithoutTable[0];
        if (firstRecipe && firstRecipe.delta) {
          const needed = firstRecipe.delta
            .filter((d: { count: number }) => d.count < 0) // Filter for required items (negative delta)
            .map(
              (d: { id: number; count: number }) =>
                `${this.mcData.items[d.id]?.name} x ${-d.count}`
            )
            .join(', ');
          reason += ` Needs: [${needed}]`;
        }
      } else if (this.mcData.items[itemId]) {
        // If NO recipes exist at all according to recipesAll
        reason = `Cannot craft ${goalItem}: No recipe exists for this item in the loaded Minecraft data version.`;
        console.warn(
          `[CraftingService] No recipes found via recipesAll for ${goalItem} (ID: ${itemId}). Check mc-data version compatibility.`
        );
      } else {
        // Fallback for item ID not found (should be caught earlier)
        reason = `Cannot craft ${goalItem}: Item ID ${itemId} not found in Minecraft data.`;
      }

      reason += `${
        tableReference
          ? ' (using table at ' + tableReference.position + ')'
          : ' (no table used)'
      }.`;
      console.error(`[CraftingService] ${reason}`);
      console.log(
        `[DEBUG Craft] Inventory: [${this.observer
          .getInventoryContents()
          .join(', ')}]`
      );
      throw new Error(reason);
    }

    // Attempt Crafting
    console.log(
      `[CraftingService] Found ${possibleRecipesFor.length} possible recipe(s) for ${goalItem}. Attempting craft...`
    );
    try {
      await this.bot.craft(
        possibleRecipesFor[0],
        1,
        tableReference ?? undefined
      ); // Pass tableReference or undefined
      console.log(`[CraftingService] Successfully crafted "${goalItem}".`);
      return;
    } catch (err: any) {
      console.error(
        `[CraftingService] Failed crafting "${goalItem}" with recipe: ${
          err.message || err
        }`
      );
      const recipe = possibleRecipesFor[0];
      if (recipe && recipe.delta) {
        console.log(
          `[DEBUG Craft] Failed Recipe Ingredients: ${recipe.delta
            .map(
              (d: { id: number; count: number }) =>
                `${this.mcData.items[d.id]?.name} x ${-d.count}`
            )
            .join(', ')}`
        );
      }
      console.log(
        `[DEBUG Craft] Inventory: [${this.observer
          .getInventoryContents()
          .join(', ')}]`
      );
      throw new Error(`Failed to craft ${goalItem}: ${err.message || err}`);
    }
  }

  /**
   * Finds an accessible crafting table, checking nearby, cached positions,
   * and inventory (placing if necessary).
   * Returns the Block object if found/placed, otherwise null.
   */
  private async findCraftingTable(): Promise<Block | null> {
    console.log('[CraftingService] Searching for usable crafting table...');

    // 1. Check nearby (within interaction range first, then wider search)
    let tableBlock = findNearbyPlacedTable(this.bot, this.INTERACTION_RANGE);
    if (tableBlock) {
      console.log(
        `[CraftingService] Found crafting table within interaction range at ${tableBlock.position}.`
      );
      return tableBlock;
    }
    tableBlock = findNearbyPlacedTable(this.bot, this.TABLE_SEARCH_RANGE);
    if (tableBlock) {
      console.log(
        `[CraftingService] Found crafting table nearby (within ${this.TABLE_SEARCH_RANGE} blocks) at ${tableBlock.position}. Moving closer...`
      );
      try {
        await this.navigation.moveToInteractRange(tableBlock);
        console.log('[CraftingService] Moved to nearby crafting table.');
        return tableBlock; // Return the block now that we're close
      } catch (err: any) {
        console.error(
          `[CraftingService] Failed to move to nearby table at ${
            tableBlock.position
          }: ${err.message || err}`
        );
        // Don't give up yet, maybe another cached one works or we can place one
      }
    }

    // 2. Check Shared State Cache
    console.log('[CraftingService] Checking cached table positions...');
    const cachedPositions = this.sharedState.craftingTablePositions;
    // Optional: Sort by distance to check closer cached tables first
    cachedPositions.sort(
      (a, b) =>
        this.bot.entity.position.distanceTo(a) -
        this.bot.entity.position.distanceTo(b)
    );

    for (const pos of cachedPositions) {
      const block = this.bot.blockAt(pos);
      if (block && block.name === 'crafting_table') {
        console.log(
          `[CraftingService] Found valid cached crafting table at ${pos}. Moving closer...`
        );
        try {
          await this.navigation.moveToInteractRange(block);
          console.log('[CraftingService] Moved to cached crafting table.');
          return block; // Found a valid cached table and moved to it
        } catch (navErr: any) {
          console.warn(
            `[CraftingService] Found cached table at ${pos} but failed to navigate: ${
              navErr.message || navErr
            }. Trying next cache entry.`
          );
          // Continue loop to check other cached positions
        }
      } else {
        console.log(
          `[CraftingService] Cached position ${pos} is no longer a crafting table. Skipping.`
        );
        // Optional: Remove invalid position from cache
        // this.sharedState.removeCraftingTablePosition(pos);
      }
    }

    // 3. Check Inventory and Place
    console.log(
      '[CraftingService] No usable table found nearby or in cache. Checking inventory...'
    );
    const tableItemInInventory = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName.crafting_table.id,
      null,
      false
    );

    if (tableItemInInventory) {
      console.log(
        '[CraftingService] Found crafting table in inventory. Attempting to place...'
      );
      try {
        const placedTable = await this.placeCraftingTable(); // Use internal placement
        console.log(
          `[CraftingService] Successfully placed table from inventory at ${placedTable.position}. Moving to interact...`
        );
        // Need to navigate to the newly placed table
        await this.navigation.moveToInteractRange(placedTable);
        console.log('[CraftingService] Moved to newly placed crafting table.');
        return placedTable; // Return the newly placed and navigated-to table
      } catch (placeOrNavErr: any) {
        console.error(
          `[CraftingService] Failed to place table from inventory or navigate to it: ${
            placeOrNavErr.message || placeOrNavErr
          }`
        );
        // If placement/navigation fails, we cannot provide a table
        return null;
      }
    }

    // 4. No Table Found
    console.log(
      '[CraftingService] No crafting table found nearby, in cache, or in inventory.'
    );
    return null;
  }

  /**
   * Internal method to place a crafting table from inventory.
   */
  private async placeCraftingTable(): Promise<Block> {
    console.log(
      '[CraftingService] Attempting to place crafting table from inventory.'
    );
    this.sharedState.addPendingAction('Place Crafting Table (Internal)'); // Indicate internal action

    const tableItem = this.bot.inventory.findInventoryItem(
      this.mcData.itemsByName.crafting_table.id,
      null,
      false
    );
    if (!tableItem) {
      throw new Error(
        '[CraftingService] Crafting table item not found in inventory.'
      );
    }

    const safePos = findSafePlacement(this.bot);
    if (!safePos) {
      throw new Error(
        '[CraftingService] No valid spot found nearby to place the crafting table!'
      );
    }

    const referenceBlock = this.bot.blockAt(safePos.offset(0, -1, 0));
    if (
      !referenceBlock ||
      !checkPlacementPossible(this.bot, this.mcData, safePos, referenceBlock)
    ) {
      const reason = !referenceBlock
        ? 'Reference block missing'
        : `Placement check failed on ref block '${referenceBlock.name}'`;
      throw new Error(
        `[CraftingService] Cannot place crafting table at ${safePos}: ${reason}.`
      );
    }

    console.log(
      `[CraftingService] Attempting internal placement of crafting table at ${safePos} onto block ${referenceBlock.name} at ${referenceBlock.position}`
    );

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.bot.equip(tableItem, 'hand'); // Equip before placing
        await this.bot.lookAt(safePos.offset(0.5, 0.5, 0.5), true);
        await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
        await sleep(100); // Wait briefly for block update

        const placedBlock = this.bot.blockAt(safePos);
        if (placedBlock?.name === 'crafting_table') {
          console.log(
            `[CraftingService] Internal placement: Crafting table placed successfully at ${safePos}!`
          );
          this.sharedState.addCraftingTablePosition(safePos);
          return placedBlock;
        } else {
          console.warn(
            `[CraftingService] Attempt ${attempt}: Placed block at ${safePos}, but it wasn't a crafting table (found ${placedBlock?.name}). Retrying if possible.`
          );
          if (attempt === maxRetries)
            throw new Error(
              `[CraftingService] Placed block is not a crafting table after ${maxRetries} attempts.`
            );
          await sleep(500 * attempt); // Wait longer before retrying
        }
      } catch (err: any) {
        console.log(
          `[CraftingService] Attempt ${attempt} to internally place crafting table failed: ${
            err.message || err
          }`
        );
        if (attempt === maxRetries) {
          throw new Error(
            `[CraftingService] All ${maxRetries} attempts to internally place crafting table failed.`
          );
        }
        await sleep(1000 * attempt); // Longer wait after error
      }
    }
    // Should not be reachable if loop logic is correct, but satisfies TypeScript
    throw new Error(
      '[CraftingService] Placing crafting table failed after exhausting retries (unexpected exit).'
    );
  }

  // Keep the useCraftingTable method if it's used elsewhere or for direct interaction testing
  public async useCraftingTable(): Promise<void> {
    // ... (existing useCraftingTable logic remains unchanged) ...
    this.sharedState.addPendingAction('Use Crafting Table');
    const positions = this.bot.findBlocks({
      point: this.bot.entity.position,
      matching: this.mcData.blocksByName.crafting_table.id,
      maxDistance: 4.4, // Keep original max distance for direct use
      count: 1,
    });

    if (positions.length === 0) {
      throw new Error('[CraftingService] No crafting table nearby to use.');
    }

    const pos = positions[0];
    const block = this.bot.blockAt(pos);

    if (!block) {
      throw new Error(
        '[CraftingService] Crafting table block not found at expected position after findBlocks.'
      );
    }

    console.log(`[CraftingService] Activating crafting table at ${pos}`);
    try {
      // Ensure bot is close enough before activating
      const distance = this.bot.entity.position.distanceTo(
        block.position.offset(0.5, 0.5, 0.5)
      );
      if (distance > this.INTERACTION_RANGE) {
        console.log(
          `[CraftingService - useTable] Table too far (${distance.toFixed(
            1
          )} > ${this.INTERACTION_RANGE}). Moving closer...`
        );
        await this.navigation.moveToInteractRange(block);
        console.log('[CraftingService - useTable] Moved closer.');
      }
      await this.bot.activateBlock(block);
      console.log('[CraftingService] Used the crafting table.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CraftingService] Failed to use crafting table: ${message}`
      );
      throw new Error(`Failed to activate crafting table: ${message}`);
    }
  }
}
