// src/cc.ts
import { Bot } from "mineflayer";
import { Memory } from "./memory";
import { Social } from "./social";
import { Goals } from "./goals";
import { Observer } from "./observer";
import { Actions } from "./actions";
import { SharedAgentState } from "./sharedAgentState";

interface CognitiveControllerOptions {
  // configuration parameters if needed
}

export class CognitiveController {
  private bot: Bot;
  private sharedState: SharedAgentState;
  private memory: Memory;
  private social: Social;
  private goals: Goals;
  private observer: Observer;
  private actions: Actions;

  constructor(
    bot: Bot,
    sharedState: SharedAgentState,
    memory: Memory,
    social: Social,
    goals: Goals,
    observer: Observer,
    actions: Actions,
    options?: CognitiveControllerOptions
  ) {
    this.bot = bot;
    this.sharedState = sharedState;
    this.memory = memory;
    this.social = social;
    this.goals = goals;
    this.observer = observer;
    this.actions = actions;
  }

  /**
   * Main update/tick method. Call this regularly (e.g., every few seconds).
   */
  public async tick(): Promise<void> {
    // 1. Update environment info by calling observer
    await this.observer.getVisibleMobs();
    await this.observer.getVisibleBlockTypes();

    // 2. If any players are around
    const playersNearby = Object.values(this.bot.players).filter(
      (p) => p.entity && p.entity.type === "player" && p.username !== this.bot.username
    );
    this.sharedState.playersNearby = playersNearby.map((p) => p.username);

    // Possibly do social checks
    if (playersNearby.length > 0) {
      const isBehaviorAligned = this.social.analyzeBehavior({ alignment: "aligned" });
      if (!isBehaviorAligned) {
        this.bot.chat("[CC] Not aligned with others, reconsidering approach...");
      }
    }

    // 3. Check for hostiles (optional)
    // ...

    // 4. Retrieve the current goals from sharedState via the Goals module
    const currentLongTermGoal = this.goals.getCurrentLongTermGoal();
    const currentShortTermGoal = this.goals.getCurrentShortTermGoal();

    // 5. If we are "lockedInTask"
    if (this.sharedState.lockedInTask) {
      // Check if it's done
      const done = await this.isCurrentTaskDone(currentShortTermGoal);
      if (done) {
        this.sharedState.lockedInTask = false;
        this.bot.chat("[CC] Finished locked-in task. Unlocking...");
      } else {
        // Skip further planning
        return;
      }
    }

    // 6. If we have a long-term goal but no short-term goal, break it down
    if (currentLongTermGoal && !currentShortTermGoal) {
      const subtasks = await this.goals.breakDownGoalWithLLM(currentLongTermGoal);
      if (subtasks.length > 0) {
        this.goals.setCurrentShortTermGoal(subtasks[0]);
        this.bot.chat(`[CC] Breaking down goal: ${currentLongTermGoal} => ${subtasks[0]}`);
      }
    }

    // 7. If we do have a short-term goal, check memory or do actions
    if (currentShortTermGoal) {
      const locationInfo = this.memory.getShortTermMemory("location_of_iron_ore");
      if (locationInfo) {
        this.bot.chat(`[CC] Found location info for iron ore: ${locationInfo}`);
      }

      // Decide to lock in
      if (currentShortTermGoal.includes("mine iron")) {
        this.sharedState.lockedInTask = true;
        this.bot.chat("[CC] Locking in to subtask: mine iron. Starting action sequence...");
        // For instance, we might call:
        // await this.actions.mine("iron_ore", 3);
        // or some other logic
      }
    }
  }

  /**
   * Check if the current short-term goal is done
   */
  private async isCurrentTaskDone(shortTermGoal: string | null): Promise<boolean> {
    if (!shortTermGoal) return true;

    if (shortTermGoal.includes("mine iron ore")) {
      // check inventory for iron_ore
      const ironCount = this.bot.inventory.items().filter(i => i.name.includes("iron_ore")).length;
      return ironCount >= 3;
    }

    return false;
  }

  private isHostile(mobName: string): boolean {
    const hostiles = ["zombie", "skeleton", "spider", "creeper"];
    return hostiles.includes(mobName.toLowerCase());
  }
}