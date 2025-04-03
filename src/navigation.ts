import { Bot } from "mineflayer";
import { Movements, goals } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { Block } from "prismarine-block"; // Assuming prismarine-block v1 is used

// Define the allowed facing directions for GoalPlaceBlockOptions
type FacingDirection = "north" | "east" | "south" | "west" | "up" | "down";

// Destructure the goal classes we need from the goals object.
const { GoalBlock, GoalLookAtBlock, GoalPlaceBlock, GoalNear } = goals;

// Define the options type for GoalPlaceBlock explicitly if not imported
// (Based on typical mineflayer-pathfinder definitions)
interface GoalPlaceBlockOptions {
  range?: number;
  faces?: Vec3[];
  facing?: FacingDirection; // Use the specific type alias
  facing3D?: boolean;
  half?: "top" | "bottom";
  LOS?: boolean;
}

/**
 * A simple Navigation class that uses mineflayer-pathfinder to move the bot
 * using different types of goals.
 */
export class Navigation {
  private bot: Bot;
  private movements: Movements;

  constructor(bot: Bot) {
    this.bot = bot;
    this.movements = new Movements(bot);
    this.bot.pathfinder.setMovements(this.movements);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * move(x, y, z): Uses GoalBlock to navigate to the specified coordinates. Retries after error twice before giving up.
   */
  public async move(x: number, y: number, z: number): Promise<void> {
    const goal = new GoalBlock(x, y, z);
    const maxRetries = 2; // Allow 2 retries after the initial attempt
    const retryDelay = 1000; // Wait 1 seconds between retries

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `[Navigation.move attempt ${attempt + 1}/${
            maxRetries + 1
          }] Navigating to goal: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(
            1
          )})`
        );

        if (!this.bot.pathfinder || !this.bot.pathfinder.goto) {
          throw new Error("Pathfinder plugin or goto method not available.");
        }

        await this.bot.pathfinder.goto(goal);

        console.log(
          `[Navigation.move] Successfully reached goal on attempt ${
            attempt + 1
          }.`
        );
        return; // Exit successfully
      } catch (err: any) {
        const errorMessage = String(err.message || err);
        console.error(
          `[Navigation.move attempt ${attempt + 1}] Error: ${errorMessage}`
        );

        // Check if it's the last attempt
        if (attempt >= maxRetries) {
          console.error(
            `[Navigation.move] Max retries reached. Failing navigation.`
          );
          throw err; // Re-throw the last error
        }

        // Check if it's a timeout error
        if (
          errorMessage.includes("Timeout") ||
          errorMessage.includes("Took to long")
        ) {
          console.warn(
            `[Navigation.move] Pathfinder timeout detected. Retrying in ${
              retryDelay / 1000
            }s...`
          );
          await this.sleep(retryDelay);
          // Continue to the next iteration of the loop
        } else {
          // It's a different error, don't retry
          console.error(
            `[Navigation.move] Non-timeout error encountered. Failing navigation.`
          );
          throw err; // Re-throw immediately
        }
      }
    }
    // Should not be reached if logic is correct, but acts as a fallback
    throw new Error("[Navigation.move] Unexpected exit from retry loop.");
  }

  /**
   * moveToLookAt(x, y, z): Uses GoalLookAtBlock to move the bot to a location where it can see the block.
   * @param reach Optional distance to maintain from the block. Default: 4.5
   */
  public async moveToLookAt(
    x: number,
    y: number,
    z: number,
    reach: number = 4.5
  ): Promise<void> {
    const pos = new Vec3(x, y, z);
    // *** FIX 1: Use 'reach' instead of 'range' for GoalLookAtBlock options ***
    const goal = new GoalLookAtBlock(pos, this.bot.world, { reach: reach });
    try {
      await this.bot.pathfinder.goto(goal);
    } catch (err) {
      console.error(`Pathfinder error (moveToLookAt GoalLookAtBlock): ${err}`);
      throw err;
    }
  }

  /**
   * moveToPlaceBlock(x, y, z, options): Uses GoalPlaceBlock to move the bot to a location where it can
   * place a block on the target block at the provided coordinates.
   * @param x number
   * @param y number
   * @param z number
   * @param options Optional options object for GoalPlaceBlock such as range, faces, facing, etc.
   */
  public async moveToPlaceBlock(
    x: number,
    y: number,
    z: number,
    options: {
      range?: number;
      faces?: number[];
      facing?: string;
      facing3D?: boolean;
      half?: string;
      LOS?: boolean;
    } = {}
  ): Promise<void> {
    const pos = new Vec3(x, y, z);
    const goal = new GoalPlaceBlock(pos, this.bot.world, {
      range: 4.5, // Maximum distance from the face; default is 5.
      faces: [new Vec3(0, 1, 0)], // Only allow clicking the top face (i.e. placing on top).
      facing: "down", // Require the bot to face down (adjust as needed).
      //facing3D: false,                    // Only consider horizontal orientation.
      //half: "top",                        // Click on the top half of the target block.
      LOS: true, // Ensure the bot has line of sight to the placement face.
    });
    try {
      await this.bot.pathfinder.goto(goal);
    } catch (err) {
      let errMsg: string;
      if (err instanceof Error) {
        errMsg = err.message;
      } else {
        errMsg = String(err);
      }
      this.bot.chat(`Pathfinder error (place block): ${errMsg}`);
    }
  }

  /**
   * moveToInteractRange(target, range): Uses GoalNear to move the bot within a specified range.
   * @param target Vec3 | Block | { x: number; y: number; z: number; } The target position.
   * @param range The desired distance to be within. Default: 2.0 blocks.
   */
  public async moveToInteractRange(
    // *** FIX 3: Explicitly allow plain object type in signature ***
    target: Vec3 | Block | { x: number; y: number; z: number },
    range: number = 2.0
  ): Promise<void> {
    let targetPos: Vec3;

    console.log("Debugging moveToInteractRange:");
    console.log("Value of Vec3:", Vec3);
    console.log("Value of Block:", Block);
    console.log("Target received:", target);

    // Type checking order matters less now that the signature is correct
    // 1. Check if it looks like a Block (has name and position object with x,y,z)
    if (
      target &&
      typeof target === "object" &&
      typeof (target as any).name === "string" &&
      (target as any).position &&
      typeof (target as any).position.x === "number" &&
      typeof (target as any).position.y === "number" &&
      typeof (target as any).position.z === "number"
    ) {
      console.log("[Navigation] Target detected as Block-like object.");
      // Type assertion needed here as we bypass instanceof
      targetPos = new Vec3(
        (target as any).position.x,
        (target as any).position.y,
        (target as any).position.z
      );
    }
    // 2. Check if it looks like a Vec3 (has x,y,z but not name/position properties)
    else if (
      target &&
      typeof target === "object" &&
      typeof (target as any).x === "number" &&
      typeof (target as any).y === "number" &&
      typeof (target as any).z === "number" &&
      !(target as any).position &&
      !(target as any).name
    ) {
      // Check specifically for x, y, z properties *at the top level*
      // This condition differentiates Vec3/plain coords from Block
      console.log("[Navigation] Target detected as Vec3 or coordinate object.");
      targetPos = new Vec3(
        (target as any).x,
        (target as any).y,
        (target as any).z
      );
    }
    // 3. If it's none of the above, it's an invalid type
    else {
      console.error(
        "[Navigation] moveToInteractRange: Invalid or unrecognized target type provided.",
        target
      );
      throw new Error(
        `Invalid or unrecognized target type for moveToInteractRange: ${typeof target}`
      );
    }
    const goal = new GoalNear(targetPos.x, targetPos.y, targetPos.z, range);
    try {
      console.log(
        `Navigating to interact range (${range} blocks) of ${targetPos}...`
      );
      await this.bot.pathfinder.goto(goal);
      console.log(`Arrived within interact range of ${targetPos}.`);
    } catch (err) {
      console.error(`Pathfinder error (moveToInteractRange GoalNear): ${err}`);
      throw err;
    }
  }
}
