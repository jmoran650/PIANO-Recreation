import { Bot } from 'mineflayer';
import { Movements, goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block';

// Type alias for Vec3-like coordinate object
type CoordinateObject = { x: number; y: number; z: number };

// Assume GoalFactory produces Goal instances. Adjust if the actual type is different.
const { GoalBlock, GoalLookAtBlock, GoalPlaceBlock, GoalNear } = goals;

export class Navigation {
 private bot: Bot;
 private movements: Movements;

 constructor(bot: Bot) {
  this.bot = bot;
  // Ensure minecraft-data is loaded for Movements if necessary, though it usually gets it from the bot instance
  this.movements = new Movements(bot);
  this.bot.pathfinder.setMovements(this.movements);
 }

 private sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
 }

 /**
 * Navigates the bot to be adjacent to the specified block coordinates.
 * Retries on timeout errors.
 * @param x - Target X coordinate.
 * @param y - Target Y coordinate.
 * @param z - Target Z coordinate.
 */
 public async move(x: number, y: number, z: number): Promise<void> {
  const goal = new GoalBlock(x, y, z);
  const maxRetries = 2;
  const retryDelay = 1000; // ms

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
   try {
    console.log(
     `[Navigation.move attempt ${attempt + 1}/${
      maxRetries + 1
     }] Navigating to goal: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(
      1
     )})`
    );

    // Ensure pathfinder is loaded (should be by constructor/plugin load)
    if (!this.bot.pathfinder || !this.bot.pathfinder.goto) {
     throw new Error('Pathfinder plugin or goto method not available.');
    }

    await this.bot.pathfinder.goto(goal);

    console.log(
     `[Navigation.move] Successfully reached goal on attempt ${
      attempt + 1
     }.`
    );
    return; // Success, exit the function
   } catch (err: unknown) {
    // FIX: Check if err is an Error before accessing message
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
     `[Navigation.move attempt ${attempt + 1}] Error: ${errorMessage}`
    );

    // Handle failure or retry
    if (attempt >= maxRetries) {
     console.error(
      '[Navigation.move] Max retries reached. Failing navigation.'
     );
     throw err; // Re-throw the original error after max retries
    }

    // Check for specific error messages indicating a timeout or pathing issue
    if (
     errorMessage.includes('Timeout') ||
     errorMessage.includes('Took too long') // Adjusted spelling
    ) {
     console.warn(
      `[Navigation.move] Pathfinder timeout detected. Retrying in ${
       retryDelay / 1000
      }s...`
     );
     await this.sleep(retryDelay); // Wait before retrying
    } else {
     // For other errors, fail immediately
     console.error(
      '[Navigation.move] Non-timeout error encountered. Failing navigation.'
     );
     throw err;
    }
   }
  }
  // Should not be reached if logic is correct, but acts as a failsafe
  throw new Error('[Navigation.move] Unexpected exit from retry loop.');
 }

 /**
 * Navigates the bot to a position where it can see the target block.
 * @param x - Target block X coordinate.
 * @param y - Target block Y coordinate.
 * @param z - Target block Z coordinate.
 * @param reach - How close the bot needs to be to "see" the block (default 4.5).
 */
 public async moveToLookAt(
  x: number,
  y: number,
  z: number,
  reach = 4.5 // Default interaction reach in Minecraft
 ): Promise<void> {
  const pos = new Vec3(x, y, z); // Target block's position
  // Goal to get within 'reach' distance and have line-of-sight to the block center
  const goal = new GoalLookAtBlock(pos, this.bot.world, { reach: reach });
  try {
   await this.bot.pathfinder.goto(goal);
  } catch (err) {
   // FIX: Ensure error message is handled correctly for template literal
   const errorMessage = err instanceof Error ? err.message : String(err);
   console.error(`Pathfinder error (moveToLookAt GoalLookAtBlock): ${errorMessage}`);
   throw err; // Re-throw to indicate failure
  }
 }

 /**
 * Navigates the bot to a position suitable for placing a block at the target location.
 * Note: This moves the bot *near* the target, not necessarily *onto* it.
 * @param x - Target block X coordinate for placement.
 * @param y - Target block Y coordinate for placement.
 * @param z - Target block Z coordinate for placement.
 */
 public async moveToPlaceBlock(
  x: number,
  y: number,
  z: number,
 ): Promise<void> {
  const pos = new Vec3(x, y, z); // The position where the block will be placed
  const goal = new GoalPlaceBlock(pos, this.bot.world, {
   range: 4.5, // Standard block placement reach
   faces: [new Vec3(0, 1, 0)], // Try placing on top of the block below
   facing: 'down', // Bot should face down towards the placement spot (optional, adjust as needed)
   // FIX: Removed 'half' property as it's not in GoalPlaceBlockOptions type definition
   LOS: true, // Require line of sight
  });
  try {
   await this.bot.pathfinder.goto(goal);
  } catch (err) {
   let errMsg: string;
   // FIX: Check if err is an Error before accessing message
   if (err instanceof Error) {
    errMsg = err.message;
   } else {
    // FIX: Convert unknown error to string
    errMsg = String(err);
   }
   this.bot.chat(`Pathfinder error (place block): ${errMsg}`);
   // Decide if you want to throw the error or just log it
   // throw new Error(`Failed to move to placement location: ${errMsg}`);
  }
 }

 /**
 * Navigates the bot to be within a specified range of a target position or block.
 * @param target - A Vec3 coordinate object {x, y, z} or a Block object.
 * @param range - The desired maximum distance from the target (default 2.0).
 */
 public async moveToInteractRange(
  target: Vec3 | Block | CoordinateObject, // Allow plain coordinate objects too
  range = 2.0 // Default close range for interaction
 ): Promise<void> {
  let targetPos: Vec3;

  // Check if it's a Block instance or Block-like object
  if (
   target &&
   typeof target === 'object' &&
   'position' in target && target.position instanceof Vec3 &&
   'name' in target && typeof target.name === 'string'
  ) {
   console.log('[Navigation] Target detected as Block-like object.');
   targetPos = target.position;
  }
  // Check if it's a Vec3 instance
  else if (target instanceof Vec3) {
   console.log('[Navigation] Target detected as Vec3 instance.');
   targetPos = target;
  }
  // FIX: Refined check for plain coordinate object {x, y, z}
  else if (
   target &&
   typeof target === 'object' &&
   'x' in target && typeof target.x === 'number' &&
   'y' in target && typeof target.y === 'number' &&
   'z' in target && typeof target.z === 'number' &&
   // Ensure it's not accidentally matching a Block or Vec3 instance
   !(target instanceof Block) &&
   !(target instanceof Vec3)
  ) {
   console.log('[Navigation] Target detected as coordinate object.');
   // FIX: Access x, y, z directly from the coordinate object 'target'
   targetPos = new Vec3(target.x, target.y, target.z);
  }
  // Handle invalid input
  else {
   console.error(
    '[Navigation] moveToInteractRange: Invalid or unrecognized target type provided.',
    target
   );
   throw new Error(
    `Invalid or unrecognized target type for moveToInteractRange: ${typeof target}`
   );
  }

  // Use the correctly determined targetPos
  const goal = new GoalNear(targetPos.x, targetPos.y, targetPos.z, range);
  try {
   console.log(
    // FIX: Use .toString() for Vec3 in template literal
    `Navigating to interact range (${range} blocks) of ${targetPos.toString()}...`
   );
   await this.bot.pathfinder.goto(goal);
   // FIX: Use .toString() for Vec3 in template literal
   console.log(`Arrived within interact range of ${targetPos.toString()}.`);
  } catch (err: unknown) {
   // FIX: Convert unknown error to string for logging
   console.error(`Pathfinder error (moveToInteractRange GoalNear): ${String(err)}`);
   throw err; // Re-throw to indicate failure
  }
 }
}