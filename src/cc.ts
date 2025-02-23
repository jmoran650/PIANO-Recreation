import { Bot } from "mineflayer";
import { Memory } from "./memory";
import { Social } from "./social";
import { Goals } from "./goals";
import { Observer } from "./observer";
import { Actions } from "./actions";

interface CognitiveControllerOptions {
  // If you have configuration parameters (e.g., distances, aggression thresholds) put them here.
}

export class CognitiveController {
  private bot: Bot;
  private memory: Memory;
  private social: Social;
  private goals: Goals;
  private observer: Observer;
  private actions: Actions;

  // Whether we are currently "locked in" on a big task (e.g., actively mining or fighting).
  // This can help the bot avoid re-planning every tick while busy.
  private lockedInTask: boolean;

  // Extra config if desired
  constructor(
    bot: Bot,
    memory: Memory,
    social: Social,
    goals: Goals,
    observer: Observer,
    actions: Actions,
    options?: CognitiveControllerOptions
  ) {
    this.bot = bot;
    this.memory = memory;
    this.social = social;
    this.goals = goals;
    this.observer = observer;
    this.actions = actions;
    this.lockedInTask = false;
  }

  /**
   * Main update/tick method. Call this regularly (e.g. every few seconds)
   * to let the cognitive controller integrate new info and decide next steps.
   */
  public async tick(): Promise<void> {
    // 1. Observe surroundings (players, mobs, blocks, etc.)
    const visibleMobs = await this.observer.getVisibleMobs();
    // If you want to see if any players/humans are near, you could check entity type or custom logic
    const playersNearby = Object.values(this.bot.players).filter(
      (p) => p.entity && p.entity.type === "player" && p.username !== this.bot.username
    );

    // 2. If humans present, do social checks
    if (playersNearby.length > 0) {
      // The Social class can update feelings automatically as it hears chat (or do other checks)
      // For example:
      const isBehaviorAligned = this.social.analyzeBehavior({ alignment: "aligned" });
      // If not aligned, maybe we want to do something like:
      if (!isBehaviorAligned) {
        this.bot.chat("[CC] Not aligned with others, reconsidering approach...");
      }
    }

    // 3. If mobs present, consider potential danger
    if (visibleMobs.Mobs.length > 0) {
      // Stub for your "danger module" logic
      // e.g. if a hostile mob is near, lock in fighting
      // Or do nothing if the bot isn't threatened
      // Example (stub):
      // const hostiles = visibleMobs.Mobs.filter(m => this.isHostile(m.name));
      // if (hostiles.length) { ... fight or run ... }
    }

    // 4. Check current long-term goal and short-term goals
    const currentLongTermGoal = this.goals.getCurrentLongTermGoal();
    const currentShortTermGoal = this.goals.getCurrentShortTermGoal();

    // If the bot is "locked in," skip re-planning unless we decide to unlock
    if (this.lockedInTask) {
      // Possibly check if the locked-in task is completed:
      // If so, unlock and allow re-planning.
      const done = await this.isCurrentTaskDone(currentShortTermGoal);
      if (done) {
        this.lockedInTask = false;
        this.bot.chat("[CC] Finished locked-in task. Unlocking...");
      } else {
        // Continue with that task and exit early.
        return;
      }
    }

    // 5. Possibly break down the current long-term goal into subtasks if none is set
    if (currentLongTermGoal && !currentShortTermGoal) {
      const subtasks = await this.goals.breakDownGoalWithLLM(currentLongTermGoal);
      // For simplicity, pick the first subtask or store them somewhere
      // (you might want a queue of short-term tasks)
      this.goals.setCurrentShortTermGoal(subtasks[0]);
      this.bot.chat(`[CC] Breaking down goal: ${currentLongTermGoal} => ${subtasks[0]}`);
    }

    // 6. Check the shortTermMemory for relevant info about the current subtask
    if (currentShortTermGoal) {
      // For example, if shortTermGoal = "mine iron ore", we might look in shortTermMemory
      // for "location_of_iron_ore" or something
      const locationInfo = this.memory.getShortTermMemory("location_of_iron_ore");
      if (locationInfo) {
        this.bot.chat(`[CC] Found location info for iron ore: ${locationInfo}`);
        // Possibly pass it to actions to move the bot, etc.
      }
    }

    // 7. Decide if we want to "lock in" to a subtask
    // e.g. if the subtask is to "mine iron ore" and we have a location
    // we might do:
    if (currentShortTermGoal && currentShortTermGoal.includes("mine iron")) {
      this.lockedInTask = true;
      this.bot.chat("[CC] Locking in to subtask: mine iron. Starting action sequence...");
      // Then you'd call some method in actions to do the mining
      // or set a separate flag that triggers mining in next ticks, etc.
    }

    // Additional logic can go here:
    // e.g. analyzing partial completion, storing event logs in memory, etc.
  }

  /**
   * Example helper to see if the current short-term goal is done.
   * In a real system, you'd check e.g. inventory or partial progress.
   */
  private async isCurrentTaskDone(shortTermGoal: string | null): Promise<boolean> {
    if (!shortTermGoal) return true; // no short-term goal => it's "done"

    // For example, if subtask is "mine iron ore (x3)" check how many iron ore we have
    if (shortTermGoal.includes("mine iron ore")) {
      // Check inventory for iron ore
      const ironCount = this.bot.inventory.items().filter(i => i.name.includes("iron_ore")).length;
      // Suppose we needed 3 and we have 3 or more:
      return ironCount >= 3;
    }

    // By default, say not done
    return false;
  }

  /**
   * Optional stub for checking if a mob is hostile.
   */
  private isHostile(mobName: string): boolean {
    // Very naive check
    const hostiles = ["zombie", "skeleton", "spider", "creeper"];
    return hostiles.includes(mobName.toLowerCase());
  }
}