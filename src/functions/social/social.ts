// src/social.ts
import { callLLM } from '../../../utils/llmWrapper';
import { SharedAgentState } from '../../sharedAgentState';

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
   * Legacy talk example (still returns a simple string).
   * Replaced by `filterMessageForSpeech` for actual rewriting.
   */
  public talk(message: string): string {
    return `[Friendly Tone] ${message}`;
  }

  /**
   * Listens to an incoming chat message from a sender and updates internal feelings
   * based on an LLM-based sentiment analysis.
   */
  public async listen(message: string, sender: string): Promise<void> {
    // Use LLM-based sentiment analysis to classify message as -1, 0, or 1
    const sentiment = await this.analyzeSentimentOfMessage(message);
    const reasons: string[] = [`Analyzed via LLM. Score: ${sentiment}`];
    this.updateFeelingsTowards(sender, sentiment, reasons);
  }

  /**
   * Takes a raw outgoing message and re-writes it using an LLM to reflect the bot's personality.
   */
  public async filterMessageForSpeech(rawMessage: string): Promise<string> {
    // Basic example prompt. This can be customized to reflect a detailed personality.
    const personalityPrompt =  'You are a Minecraft character with a friendly, upbeat personality.';
    const systemPrompt = `
Rewrite the supplied text so it reflects your personality,
while preserving the core meaning and tone. You do not need to make drastic changes to the message unless necessary.
Between changing the meaning of the message and upholding your personality, always choose to maintain the meaning.
Output ONLY the rewritten text, with no extra commentary.
`;
    const userContent = rawMessage.trim();
    if (!userContent) return '';

    // Combine them into a single message to feed the LLM
    const prompt = `${personalityPrompt} ${systemPrompt} \nUser text: "${userContent}"\nRewritten:`;
    const filtered = await callLLM(prompt);
    return filtered.trim();
  }

  /**
   * Private helper that uses the LLM to determine if a message is negative, neutral, or positive.
   * Returns -1 for negative, 0 for neutral, +1 for positive.
   */
  private async analyzeSentimentOfMessage(message: string): Promise<number> {
    const sentimentPrompt = `
You are a sentiment analysis model. Describe the sentiment of this message and decide whether your relationship with the person who said it should be adjusted accordingly:
"${message}"`;
    const result = await callLLM(sentimentPrompt);
    const lower = result.toLowerCase();

    if (lower.includes('positive')) return 1;
    if (lower.includes('negative')) return -1;
    return 0;
  }
}
