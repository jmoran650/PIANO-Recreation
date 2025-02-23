// export class Social() {

    //Feelings to others table: person: feelings table, should include reference to reasons for feeling that way? CC can reference event in LTM if necessary

    //Model of others feelings towards self table:
        //person to feelings table. Maybe these two should be the same?

    //Behavior awareness
        //intake current social context, determine if current behavior is aligned with others

    //Goal awareness
        //determine whether ones goals are compatible with others

    //truth determiner
        // should bot tell the truth?
    
    //talk
        //takes in what bot wants to say at a high level and rewrites (tones) it according to the bots personality
    
    // listen
        //intake what others say, determine how bot feels 

//}


// src/social.ts

export class Social {
    /**
     * Feelings the bot has toward others.
     * Maps a person's identifier to an object containing a sentiment value
     * (e.g., positive, negative, neutral) and an array of reasons.
     */
    private feelingsToOthers: Map<string, { sentiment: number; reasons: string[] }>;
  
    /**
     * A model of how others feel toward the bot.
     * Maps a person's identifier to an object containing a sentiment value
     * and an array of reasons.
     */
    private othersFeelingsTowardsSelf: Map<string, { sentiment: number; reasons: string[] }>;
  
    constructor() {
      this.feelingsToOthers = new Map();
      this.othersFeelingsTowardsSelf = new Map();
    }
  
    /**
     * Updates or sets the bot's feelings toward another person.
     * @param person - The identifier of the other person.
     * @param sentiment - A numeric representation of the sentiment.
     * @param reasons - An array of strings explaining why the bot feels that way.
     */
    public updateFeelingsTowards(person: string, sentiment: number, reasons: string[]): void {
      this.feelingsToOthers.set(person, { sentiment, reasons });
    }
  
    /**
     * Updates the model of how others feel about the bot.
     * @param person - The identifier of the person.
     * @param sentiment - A numeric representation of the sentiment.
     * @param reasons - An array of strings explaining the reasons.
     */
    public updateOthersFeelingsTowardsSelf(person: string, sentiment: number, reasons: string[]): void {
      this.othersFeelingsTowardsSelf.set(person, { sentiment, reasons });
    }
  
    /**
     * Analyzes the current social context and determines if the bot's behavior is aligned with others.
     * @param socialContext - An object representing the current social context.
     * @returns True if behavior is aligned, false otherwise.
     */
    public analyzeBehavior(socialContext: any): boolean {
      // Stub implementation: if socialContext has an "alignment" property, use it.
      if (socialContext && socialContext.alignment) {
        return socialContext.alignment === "aligned";
      }
      // Default assumption is that behavior is aligned.
      return true;
    }
  
    /**
     * Analyzes the bot's own goals in comparison to others' goals to determine compatibility.
     * @param ownGoals - An array of strings representing the bot's goals.
     * @param othersGoals - A Map where the key is a person's identifier and the value is an array of that person's goals.
     * @returns True if at least one of the bot's goals is shared by someone else.
     */
    public analyzeGoals(ownGoals: string[], othersGoals: Map<string, string[]>): boolean {
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
     * Determines if the bot should tell the truth.
     * This decision could be influenced by internal factors or social context.
     * @returns True if the bot should tell the truth, false otherwise.
     */
    public truthDeterminer(): boolean {
      // Stub implementation: always tell the truth.
      return true;
    }
  
    /**
     * Takes in a high-level message and rewrites it according to the bot's personality.
     * @param message - The original high-level message.
     * @returns The transformed message.
     */
    public talk(message: string): string {
      // Stub: prepend a tone indicator to simulate personality.
      return `[Friendly Tone] ${message}`;
    }
  
    /**
     * Processes an incoming message from another and updates the bot's feelings.
     * @param message - The message received.
     * @param sender - The identifier of the person who sent the message.
     */
    public listen(message: string, sender: string): void {
      // Simple sentiment analysis: assign sentiment based on keywords.
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
      // Update the bot's feelings towards the sender.
      this.updateFeelingsTowards(sender, sentiment, reasons);
    }
  }