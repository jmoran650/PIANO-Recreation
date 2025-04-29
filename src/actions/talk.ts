// src/actions/talk.ts
import dotenv from 'dotenv';
import { Bot } from 'mineflayer';

// Load environment variables
dotenv.config();

/**
 * Service responsible for handling chat-related actions.
 */
export class TalkService {
  private bot: Bot;

  /**
   * Creates an instance of TalkService.
   * @param bot - The mineflayer Bot instance.
   */
  constructor(bot: Bot) {
    this.bot = bot;
    console.log('[TalkService] Initialized.'); // Optional: Add initialization log
  }

  /**
   * Sends a chat message to the server.
   * Matches the functionality of the original `chat` method in actions.ts.
   * @param message - The message string to send.
   */
  public chat(message: string): void {
    if (!message || typeof message !== 'string' || message.trim() === '') {
        console.warn('[TalkService] Attempted to send an empty or invalid chat message.');
        return; // Avoid sending empty messages
    }
    try {
        this.bot.chat(message);
        console.log(`[TalkService] Sent chat message: "${message}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
        console.error(`[TalkService] Error sending chat message: ${msg}`);
        // Depending on desired robustness, you might want to re-throw or handle differently
    }
  }
}