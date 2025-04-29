// src/goals.ts
import { SharedAgentState } from './sharedAgentState';

export class Goals {
  private sharedState: SharedAgentState;

  constructor(sharedState: SharedAgentState) {
    this.sharedState = sharedState;
  }

  /**
   * Add a new long-term goal to the queue or set it if none is active.
   */
  public addLongTermGoal(goal: string): void {
    if (!this.sharedState.currentLongTermGoal) {
      this.sharedState.currentLongTermGoal = goal;
    } else {
      const queue = this.sharedState.longTermGoalQueue;
      queue.push(goal);
      this.sharedState.longTermGoalQueue = queue; // or queue.splice(0) if desired
    }
  }

  /**
   * Return the current long-term goal.
   */
  public getCurrentLongTermGoal(): string | null {
    return this.sharedState.currentLongTermGoal;
  }

  /**
   * Return the current short-term goal.
   */
  public getCurrentShortTermGoal(): string | null {
    return this.sharedState.currentShortTermGoal;
  }

  /**
   * Example breakdown logic using an LLM (stub).
   */
  public breakDownGoalWithLLM(goal: string) {
    if (goal.toLowerCase().includes('iron pickaxe')) {
      return [
        'mine iron ore (find iron ore, travel to iron ore, mine it)',
        'make furnace (gather stone, craft furnace)',
        'smelt iron ore (ore + fuel in furnace)',
        'craft iron pickaxe (sticks + iron ingots)',
      ];
    }
    return ['No known breakdown; proceed manually.'];
  }

  /**
   * Set current short-term goal.
   */
  public setCurrentShortTermGoal(stGoal: string): void {
    this.sharedState.currentShortTermGoal = stGoal;
  }

  /**
   * Move on to the next long-term goal in the queue.
   */
  public advanceLongTermGoal(): void {
    const queue = this.sharedState.longTermGoalQueue;
    if (queue.length === 0) {
      this.sharedState.currentLongTermGoal = null;
      this.sharedState.currentShortTermGoal = null;
      return;
    }
    const nextGoal = queue.shift() || null;
    this.sharedState.currentLongTermGoal = nextGoal;
    this.sharedState.currentShortTermGoal = null;
  }
}
