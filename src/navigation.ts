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

  /**
   * move(x, y, z): Uses GoalBlock to navigate to the specified coordinates.
   */
  public async move(x: number, y: number, z: number): Promise<void> {
    const goal = new GoalBlock(x, y, z);
    try {
      await this.bot.pathfinder.goto(goal);
    } catch (err) {
      console.error(`Pathfinder error (move GoalBlock): ${err}`);
      throw err;
    }
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
    if (target instanceof Vec3) {
      targetPos = target;
    } else if (target instanceof Block) {
      targetPos = target.position;
      // Check for plain object structure AFTER Vec3/Block instances
    } else if (
      typeof target === "object" &&
      target !== null &&
      "x" in target &&
      "y" in target &&
      "z" in target
    ) {
      // Now TypeScript knows 'target' here could be the {x,y,z} object, not 'never'
      targetPos = new Vec3(target.x, target.y, target.z);
    } else {
      console.error("moveToInteractRange: Invalid target type provided.");
      throw new Error("Invalid target type for moveToInteractRange");
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
