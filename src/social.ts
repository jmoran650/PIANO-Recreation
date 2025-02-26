// src/social.ts
import { SharedAgentState } from "./sharedAgentState";

export class Social {
  private sharedState: SharedAgentState;

  constructor(sharedState: SharedAgentState) {
    this.sharedState = sharedState;
  }

  /**
   * Updates or sets the bot's feelings toward another person.
   */
  public updateFeelingsTowards(
    person: string,
    sentiment: number,
    reasons: string[]
  ): void {
    this.sharedState.updateFeelingsTowards(person, sentiment, reasons);
  }

  /**
   * Updates the model of how others feel about the bot.
   */
  public updateOthersFeelingsTowardsSelf(
    person: string,
    sentiment: number,
    reasons: string[]
  ): void {
    this.sharedState.updateOthersFeelingsTowardsSelf(
      person,
      sentiment,
      reasons
    );
  }

  /**
   * Analyzes the current social context to see if the bot's behavior is "aligned."
   */
  public analyzeBehavior(socialContext: any): boolean {
    if (socialContext && socialContext.alignment) {
      return socialContext.alignment === "aligned";
    }
    return true;
  }

  /**
   * Analyzes the bot's own goals in comparison to others' goals to determine compatibility.
   */
  public analyzeGoals(
    ownGoals: string[],
    othersGoals: Map<string, string[]>
  ): boolean {
    for (const [, goals] of othersGoals.entries()) {
      for (const goal of ownGoals) {
        if (goals.includes(goal)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Simple truth determinator.
   */
  public truthDeterminer(): boolean {
    return true;
  }

  /**
   * Takes in a high-level message and rewrites it.
   */
  public talk(message: string): string {
    return `[Friendly Tone] ${message}`;
  }

  /**
   * Process an incoming chat message and update feelings accordingly.
   */
  public listen(message: string, sender: string): void {
    let sentiment = 0;
    const reasons: string[] = [];
    if (message.includes("good")) {
      sentiment = 1;
      reasons.push("Positive message");
    } else if (message.includes("bad")) {
      sentiment = -1;
      reasons.push("Negative message");
    } else {
      sentiment = 0;
      reasons.push("Neutral message");
    }
    this.updateFeelingsTowards(sender, sentiment, reasons);
  }
}
