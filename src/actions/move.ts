// src/actions/MovementService.ts
import dotenv from 'dotenv';
import minecraftData from 'minecraft-data'; // Included for consistency
import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block'; // Included for consistency
import { Vec3 } from 'vec3'; // Included for consistency
import { Navigation } from '../navigation'; // Essential dependency
import { SharedAgentState } from '../sharedAgentState';

dotenv.config();


export class MovementService {
  private bot: Bot;
  private navigation: Navigation; // Essential dependency
  private mcData: any; // Keep for consistency
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
    this.mcData = minecraftData(process.env.MINECRAFT_VERSION); // Init for consistency
  }

  /**
   * Navigates the bot to the current location of a specified player.
   */
  async gotoPlayer(playerName: string): Promise<void> {
    // Input validation (from original)
    if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
        throw new Error('[MovementService] Invalid arguments: \'playerName\' must be a non-empty string.');
    }

    const targetDesc = `player ${playerName}`;
    this.sharedState.addPendingAction(`Go to ${targetDesc}`);
    console.log(`[MovementService] Attempting to navigate to ${targetDesc}`);

    // Find player entity (Original logic)
    const targetPlayer = this.bot.players[playerName];

    // Check if player entity exists (Original logic improved slightly)
    if (!targetPlayer || !targetPlayer.entity) {
        // Check shared state as fallback? Original did this.
      if (this.sharedState.playersNearby.includes(playerName)) {
          // Player is listed as nearby but entity data might not be loaded yet.
          console.warn(`[MovementService] Player '${playerName}' listed nearby but entity not found. Trying again shortly might work.`);
          throw new Error(`Player '${playerName}' is nearby but entity data may not be loaded yet.`);
      } else {
          // Player is not known or not nearby.
          console.error(`[MovementService] Cannot find player '${playerName}' nearby.`);
          throw new Error(`Cannot find player '${playerName}' nearby.`);
      }
    }

    // Get destination and navigate (Original logic)
    const destination = targetPlayer.entity.position;
    console.log(`[MovementService] Found ${playerName} at ${destination.toString()}`); // Use toString for vec3

    try {
      // Use the injected Navigation service
      await this.navigation.move(destination.x, destination.y, destination.z);
      console.log(`[MovementService] Successfully navigated to ${targetDesc}.`);
    } catch (error: any) {
      console.error(`[MovementService] Navigation failed when going to ${targetDesc}:`, error);
      // Re-throw error to indicate failure
      throw new Error(`Navigation failed: Could not reach ${targetDesc}. Reason: ${error.message || error}`);
    }
  }

  /**
   * Navigates the bot to the specified world coordinates.
   */
  async gotoCoordinates(coordinates: { x: number; y: number; z: number }): Promise<void> {
      // Input validation (from original)
     if (!coordinates || typeof coordinates.x !== 'number' || typeof coordinates.y !== 'number' || typeof coordinates.z !== 'number') {
         throw new Error('[MovementService] Invalid arguments: \'coordinates\' must be an object with numeric x, y, and z properties.');
     }

     // Use Vec3 for easier handling? Original used object directly. Keep object.
     const targetDesc = `coordinates (${coordinates.x.toFixed(1)}, ${coordinates.y.toFixed(1)}, ${coordinates.z.toFixed(1)})`;
     this.sharedState.addPendingAction(`Go to ${targetDesc}`);
     console.log(`[MovementService] Attempting to navigate to ${targetDesc}`);

     try {
        // Use the injected Navigation service
      await this.navigation.move(coordinates.x, coordinates.y, coordinates.z);
      console.log(`[MovementService] Successfully navigated to ${targetDesc}.`);
     } catch (error: any) {
        console.error(`[MovementService] Navigation failed when going to ${targetDesc}:`, error);
        // Re-throw error to indicate failure
        throw new Error(`Navigation failed: Could not reach ${targetDesc}. Reason: ${error.message || error}`);
     }
  }
}