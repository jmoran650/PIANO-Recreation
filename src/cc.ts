// src/cc.ts
import { Bot } from "mineflayer";
import { Actions } from "./actions";
import { Memory } from "./functions/memory/memory";
import { Social } from "./functions/social/social";
import { Goals } from "./goals";
import { Observer } from "./observer";
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

  // Store interval IDs so we can clear them if needed later
  private fastLoopIntervalId: NodeJS.Timeout | null = null;
  private slowLoopIntervalId: NodeJS.Timeout | null = null;

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
   * Start concurrent loops: a fast reflex loop and a slower planning loop.
   */
  public startConcurrentLoops(): void {
    // Fast loop every 1 second (quick checks, e.g. immediate threats)
    this.fastLoopIntervalId = setInterval(() => {
      this.fastReflexTick().catch((err) => {
        console.error("[CC-FastReflex] Error:", err);
      });
    }, 1000);

    // Slow loop every 5 seconds (heavy planning, existing logic)
    this.slowLoopIntervalId = setInterval(() => {
      this.slowPlanningTick().catch((err) => {
        console.error("[CC-SlowPlan] Error:", err);
      });
    }, 5000);
  }

  /**
   * An example "fast reflex" loop for immediate or frequent checks.
   */
  private async fastReflexTick(): Promise<void> {
    // 1. Possibly check for hostile mobs or urgent situations
    //    This is a good place to do quick environment scans or short-latency tasks
    const visibleMobs = await this.observer.getVisibleMobs();
    const hostiles = visibleMobs.Mobs.filter((m) => this.isHostile(m.name));
    if (hostiles.length > 0) {
      //this.bot.chat("[Reflex] Hostile mob detected!");
      // Decide quickly whether to run away, fight, or alert
      // For example, you might set a short-term "defend" sub-goal or call an action
    }

    // 2. (Optional) Quickly handle any memory cleanup or ephemeral tasks
    // ...
  }

  /**
   * An example "slow planning" loop (formerly your tick() method).
   * We just rename it to avoid confusion with the new concurrency approach.
   */
  private async slowPlanningTick(): Promise<void> {
    // 1. Update environment info if not done by fastReflex
    //    You can skip or keep an additional observer call here
    await this.observer.getVisibleBlockTypes();

    // 2. Check players
    const playersNearby = Object.values(this.bot.players).filter(
      (p) =>
        p.entity &&
        p.entity.type === "player" &&
        p.username !== this.bot.username
    );
    this.sharedState.playersNearby = playersNearby.map((p) => p.username);

    // Social alignment check
    if (playersNearby.length > 0) {
      const isBehaviorAligned = this.social.analyzeBehavior({
        alignment: "aligned",
      });
      if (!isBehaviorAligned) {
        this.bot.chat(
          "[CC] Not aligned with others, reconsidering approach..."
        );
      }
    }

    // 3. Evaluate goals
    const currentLongTermGoal = this.goals.getCurrentLongTermGoal();
    const currentShortTermGoal = this.goals.getCurrentShortTermGoal();

    // Handle locked-in tasks
    if (this.sharedState.lockedInTask) {
      const done = await this.isCurrentTaskDone(currentShortTermGoal);
      if (done) {
        this.sharedState.lockedInTask = false;
        this.bot.chat("[CC] Finished locked-in task. Unlocking...");
      } else {
        return; // skip further planning this cycle
      }
    }

    // If we have a long-term goal but no short-term goal, break it down
    if (currentLongTermGoal && !currentShortTermGoal) {
      const subtasks = await this.goals.breakDownGoalWithLLM(
        currentLongTermGoal
      );
      if (subtasks.length > 0) {
        this.goals.setCurrentShortTermGoal(subtasks[0]);
        this.bot.chat(
          `[CC] Breaking down goal: ${currentLongTermGoal} => ${subtasks[0]}`
        );
      }
    }

    // Check if we have a short-term goal, maybe do something
    if (currentShortTermGoal) {
      // Example check:
      if (currentShortTermGoal.includes("mine iron")) {
        this.sharedState.lockedInTask = true;
        this.bot.chat(
          "[CC] Locking in to subtask: mine iron. Starting action sequence..."
        );
        // Potentially call an action immediately or rely on the next loop
        // await this.actions.mine("iron_ore", 3);
      }
    }
  }

  /**
   * Check if the current short-term goal is done
   */
  private async isCurrentTaskDone(
    shortTermGoal: string | null
  ): Promise<boolean> {
    if (!shortTermGoal) return true;
    if (shortTermGoal.includes("mine iron ore")) {
      const ironCount = this.bot.inventory
        .items()
        .filter((i) => i.name.includes("iron_ore")).length;
      return ironCount >= 3;
    }
    return false;
  }

  /**
   * Simple method to see if a mob is in the hostile list.
   */
  private isHostile(mobName: string): boolean {
    const hostiles = ["zombie", "skeleton", "spider", "creeper"];
    return hostiles.includes(mobName.toLowerCase());
  }

  /**
   * Optional: method to stop loops if you want to disable concurrency dynamically.
   */
  public stopConcurrentLoops(): void {
    if (this.fastLoopIntervalId) {
      clearInterval(this.fastLoopIntervalId);
      this.fastLoopIntervalId = null;
    }
    if (this.slowLoopIntervalId) {
      clearInterval(this.slowLoopIntervalId);
      this.slowLoopIntervalId = null;
    }
    this.bot.chat("[CC] Concurrency loops stopped.");
  }
}
