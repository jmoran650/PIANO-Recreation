// src/actions/move.ts
// src/actions/MovementService.ts
import dotenv from 'dotenv';

// Import necessary types
import { Bot, Player } from 'mineflayer'; // Added Player type
import { Vec3 } from 'vec3'; // Added Vec3 type
import { Navigation } from '../navigation'; // Essential dependency
import { SharedAgentState } from '../sharedAgentState';

dotenv.config();

export class MovementService {
  private bot: Bot;
  private navigation: Navigation; // Essential dependency
  private sharedState: SharedAgentState;

  constructor(
    bot: Bot,
    navigation: Navigation, // Inject Navigation
    sharedState: SharedAgentState
    // observer: Observer // Not needed by these funcs
  ) {
    this.bot = bot;
    this.navigation = navigation;
    this.sharedState = sharedState;
    if (process.env.MINECRAFT_VERSION == undefined) {
      throw new Error('[MovementService] Minecraft Version Undefined');
    }
  }

  /**
   * Navigates the bot to the current location of a specified player.
   */
  async gotoPlayer(playerName: string): Promise<void> {
    // Input validation (from original)
    if (
      !playerName ||
      typeof playerName !== 'string' ||
      playerName.trim() === ''
    ) {
      throw new Error(
        "[MovementService] Invalid arguments: 'playerName' must be a non-empty string."
      );
    }

    const targetDesc = `player ${playerName}`;
    this.sharedState.addPendingAction(`Go to ${targetDesc}`);
    console.log(`[MovementService] Attempting to navigate to ${targetDesc}`);

    // Find player entity (Original logic)
    // FIX: Add type Player | undefined
    const targetPlayer: Player | undefined = this.bot.players[playerName];

    // Check if player entity exists (Original logic improved slightly)
    // Use the typed targetPlayer
    if (!targetPlayer?.entity) { // Use optional chaining for conciseness
      // Check shared state as fallback? Original did this.
      if (this.sharedState.playersNearby.includes(playerName)) {
        // Player is listed as nearby but entity data might not be loaded yet.
        console.warn(
          `[MovementService] Player '${playerName}' listed nearby but entity not found. Trying again shortly might work.`
        );
        throw new Error(
          `Player '${playerName}' is nearby but entity data may not be loaded yet.`
        );
      } else {
        // Player is not known or not nearby.
        console.error(
          `[MovementService] Cannot find player '${playerName}' nearby.`
        );
        throw new Error(`Cannot find player '${playerName}' nearby.`);
      }
    }

    // Get destination and navigate (Original logic)
    // FIX: Add type Vec3
    const destination: Vec3 = targetPlayer.entity.position;
    // FIX: Format Vec3 manually for consistent and safe logging
    console.log(
      `[MovementService] Found ${playerName} at (${destination.x}, ${destination.y}, ${destination.z})`
    );

    try {
      // Use the injected Navigation service
      await this.navigation.move(destination.x, destination.y, destination.z);
      console.log(`[MovementService] Successfully navigated to ${targetDesc}.`);
    } catch (error: unknown) { // FIX: Catch error as unknown instead of any
      // FIX: Handle unknown error type safely
      let errorMessage = 'Unknown error during navigation';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }
      console.error(
        `[MovementService] Navigation failed when going to ${targetDesc}:`,
        String(error) // Log the original error safely
      );
      // Re-throw error to indicate failure
      throw new Error(
        `Navigation failed: Could not reach ${targetDesc}. Reason: ${errorMessage}`
      );
    }
  }

  /**
   * Navigates the bot to the specified world coordinates.
   */
  async gotoCoordinates(coordinates: {
    x: number;
    y: number;
    z: number;
  }): Promise<void> {
    // Input validation (from original)
    if (
      !coordinates ||
      typeof coordinates.x !== 'number' ||
      typeof coordinates.y !== 'number' ||
      typeof coordinates.z !== 'number'
    ) {
      throw new Error(
        "[MovementService] Invalid arguments: 'coordinates' must be an object with numeric x, y, and z properties."
      );
    }

    // Use Vec3 for easier handling? Original used object directly. Keep object.
    const targetDesc = `coordinates (${coordinates.x.toFixed(
      1
    )}, ${coordinates.y.toFixed(1)}, ${coordinates.z.toFixed(1)})`;
    this.sharedState.addPendingAction(`Go to ${targetDesc}`);
    console.log(`[MovementService] Attempting to navigate to ${targetDesc}`);

    try {
      // Use the injected Navigation service
      await this.navigation.move(coordinates.x, coordinates.y, coordinates.z);
      console.log(`[MovementService] Successfully navigated to ${targetDesc}.`);
    } catch (error: unknown) { // FIX: Catch error as unknown instead of any
      // FIX: Handle unknown error type safely
      let errorMessage = 'Unknown error during navigation';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }
      console.error(
        `[MovementService] Navigation failed when going to ${targetDesc}:`,
        String(error) // Log the original error safely
      );
      // Re-throw error to indicate failure
      throw new Error(
        `Navigation failed: Could not reach ${targetDesc}. Reason: ${errorMessage}`
      );
    }
  }
}