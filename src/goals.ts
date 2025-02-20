/**
 * goals.ts
 *
 * Manages the bot's goals. A "long-term goal" is the primary objective
 * (e.g., "get iron pickaxe"). It is composed of multiple "short-term goals"
 * (subtasks) that can be executed sequentially or in parallel.
 *
 * This class:
 * - Maintains one current long-term goal at a time.
 * - Maintains one current short-term goal from among that long-term goal's subtasks.
 * - Allows insertion of new long-term goals (the bot might queue them up or switch).
 * - Breaks down a long-term goal into subtasks using an LLM (stubbed).
 */

export class Goals {
    /** List of all pending long-term goals the bot eventually wants to accomplish. */
    private longTermGoalQueue: string[] = []
  
    /** The current long-term goal the bot is working on. */
    private currentLongTermGoal: string | null = null
  
    /** The current short-term goal (subtask) the bot is working on right now. */
    private currentShortTermGoal: string | null = null
  
    /**
     * Add a new long-term goal to the bot. If the bot doesn’t have a current
     * long-term goal, we can set it immediately; otherwise, we queue it.
     */
    public addLongTermGoal(goal: string): void {
      // If we have no current long-term goal, set this goal as current
      if (!this.currentLongTermGoal) {
        this.currentLongTermGoal = goal
        // We might also want to break it down into subtasks immediately, etc.
        // but for now we just store it.
      } else {
        // Otherwise, push it into the queue
        this.longTermGoalQueue.push(goal)
      }
    }
  
    /**
     * Returns the current long-term goal (if any).
     */
    public getCurrentLongTermGoal(): string | null {
      return this.currentLongTermGoal
    }
  
    /**
     * Returns the current short-term goal (if any).
     */
    public getCurrentShortTermGoal(): string | null {
      return this.currentShortTermGoal
    }
  
    /**
     * Attempt to break down a long-term goal into direct-action subtasks
     * using an LLM. For example:
     *   "get iron pickaxe" -> [
     *     "mine iron ore -> find iron ore -> go to iron ore -> mine iron ore (x3)",
     *     "make furnace -> gather stone -> craft furnace",
     *     "smelt iron ore -> put ore in furnace -> use fuel",
     *     "craft iron pickaxe -> gather sticks -> craft pickaxe"
     *   ]
     *
     * This method is stubbed out here. You would fill in the LLM call to an
     * external API or local model for the actual breakdown logic.
     */
    public async breakDownGoalWithLLM(goal: string): Promise<string[]> {
      // In a real scenario, you'd call your LLM here, e.g.:
      // const prompt = `Break down "${goal}" into direct-action tasks. ...`
      // const response = await callMyLLMAPI(prompt)
      // return parseResponseIntoSubtasks(response)
  
      // For now, we simulate returning a set of subtasks for demonstration:
      if (goal.toLowerCase().includes("iron pickaxe")) {
        return [
          "mine iron ore (find iron ore, travel to iron ore, mine it)",
          "make furnace (gather stone, craft furnace)",
          "smelt iron ore (ore + fuel in furnace)",
          "craft iron pickaxe (sticks + iron ingots)"
        ]
      }
      // If not recognized, just pass back a trivial subtask
      return ["No known breakdown; proceed manually."]
    }
  
    /**
     * A small helper to set the current short-term goal. Usually, this is the
     * next subtask from the breakdown of the current long-term goal.
     */
    public setCurrentShortTermGoal(stGoal: string): void {
      this.currentShortTermGoal = stGoal
    }
  
    /**
     * Example of how you might progress to the next long-term goal in the queue
     * once the current one is finished. Or you could do it automatically after
     * subtasks are done. This is optional logic you can adapt.
     */
    public advanceLongTermGoal(): void {
      if (this.longTermGoalQueue.length === 0) {
        this.currentLongTermGoal = null
        this.currentShortTermGoal = null
        return
      }
      // Dequeue the next goal
      this.currentLongTermGoal = this.longTermGoalQueue.shift() || null
      this.currentShortTermGoal = null
    }
  }