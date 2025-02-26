import { Bot } from "mineflayer";
import { pathfinder, Movements, goals } from "mineflayer-pathfinder";

// Destructure out the specific goal class we want to use
const { GoalBlock } = goals;

/**
 * A simple Movement class that uses mineflayer-pathfinder to move the bot to
 * a specified coordinate (x, y, z).
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
      this.bot.chat("Arrived at my goal!");
    } catch (err) {
      // Use proper narrowing to get an error message.
      let errMsg: string;
      if (err instanceof Error) {
        errMsg = err.message;
      } else {
        errMsg = String(err);
      }
      // Chat the error message so the bot lets you know what happened.
      this.bot.chat(`Pathfinder error: ${errMsg}`);
    }
  }

  //TODO: Safe movement (avoid lava, falling) ?? May not be necessary.

  //TODO: evasive movement (if one decides to run away from mobs or other bots, has optional goal in case of trying to get back to village, safety,etc. )

  //TODO: Normal movement: avoid breaking things to reach someone if not necessary.
}
