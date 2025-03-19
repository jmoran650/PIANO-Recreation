import { Bot } from "mineflayer";
import { pathfinder, Movements, goals } from "mineflayer-pathfinder";
import { Vec3 } from "vec3"; // Make sure to have vec3 installed and imported

// Destructure the goal classes we need from the goals object.
const { GoalBlock, GoalLookAtBlock, GoalPlaceBlock } = goals;

/**
 * A simple Navigation class that uses mineflayer-pathfinder to move the bot
 * to a specified coordinate (x, y, z) using different types of goals.
 */
export class Navigation {
  private bot: Bot;
  private movements: Movements;

  constructor(bot: Bot) {
    this.bot = bot;

    // Create a new Movements instance for this bot
    this.movements = new Movements(bot);
    // Set our Movements configuration in pathfinder
    this.bot.pathfinder.setMovements(this.movements);
  }

  /**
   * move(x, y, z): Uses the pathfinder's GoalBlock to navigate to the specified coordinates
   * @param x number
   * @param y number
   * @param z number
   */
  public async move(x: number, y: number, z: number): Promise<void> {
    const goal = new GoalBlock(x, y, z);
    try {
      await this.bot.pathfinder.goto(goal);
      // Optionally: this.bot.chat("Arrived at my goal!");
    } catch (err) {
      let errMsg: string;
      if (err instanceof Error) {
        errMsg = err.message;
      } else {
        errMsg = String(err);
      }
      this.bot.chat(`Pathfinder error: ${errMsg}`);
    }
  }

  /**
   * moveToLookAt(x, y, z): Uses GoalLookAtBlock to move the bot to a location where it can see the block
   * at the provided coordinates.
   * @param x number
   * @param y number
   * @param z number
   */
  public async moveToLookAt(x: number, y: number, z: number): Promise<void> {
    const pos = new Vec3(x, y, z);
    const goal = new GoalLookAtBlock(pos, this.bot.world);
    try {
      await this.bot.pathfinder.goto(goal);
    } catch (err) {
      let errMsg: string;
      if (err instanceof Error) {
        errMsg = err.message;
      } else {
        errMsg = String(err);
      }
      this.bot.chat(`Pathfinder error (look at block): ${errMsg}`);
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
    options: { range?: number; faces?: number[]; facing?: string; facing3D?: boolean; half?: string; LOS?: boolean} = {}
  ): Promise<void> {
    const pos = new Vec3(x, y, z);
    const goal = new GoalPlaceBlock(pos, this.bot.world, {
      range: 4.5,                           // Maximum distance from the face; default is 5.
      faces: [new Vec3(0, 1, 0)],           // Only allow clicking the top face (i.e. placing on top).
      facing: "down",                    // Require the bot to face down (adjust as needed).
      //facing3D: false,                    // Only consider horizontal orientation.
      //half: "top",                        // Click on the top half of the target block.
      LOS: true                           // Ensure the bot has line of sight to the placement face.
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
}