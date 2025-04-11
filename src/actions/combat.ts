// src/actions/combat.ts
import dotenv from 'dotenv';
import { Bot, BotEvents } from 'mineflayer';
import { SharedAgentState } from '../sharedAgentState';
import { Entity } from 'prismarine-entity'; // Import Entity type

dotenv.config();

declare module 'mineflayer' {
  // Extend Bot interface if necessary, e.g., for pvp plugin typing if available

  interface BotEvents {
    stoppedAttacking: () => void;
  }
   // Add isValid property to Entity definition if it's commonly used/expected
   // Note: This might not be officially part of prismarine-entity, depends on plugins/version
   interface Entity {
       isValid?: boolean;
   }
}

export class CombatService {
  private bot: Bot;
  private sharedState: SharedAgentState;

  constructor(
    bot: Bot,
    sharedState: SharedAgentState
  ) {
    this.bot = bot;
    this.sharedState = sharedState;
  }

  /**
   * Attacks the nearest entity matching the specified name (mob type or player username).
   * @param targetName - The name of the mob type or player username to attack.
   */
  async attack(targetName: string): Promise<void> {
    this.sharedState.addPendingAction(`Attack ${targetName}`);

    // Access pvp with type assertion for potentially better type safety if defined in module declaration
    const pvp = this.bot.pvp;
    if (!pvp || typeof pvp.attack !== 'function') {
      const errorMsg = '[CombatService] pvp plugin or pvp.attack function unavailable.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const targetIsPlayer = this.bot.players[targetName.toLowerCase()] !== undefined;
    console.log(`[CombatService] attack: Target="${targetName}", IsPlayer=${targetIsPlayer}`);

    const entitiesToSearch = Object.values(this.bot.entities);
    // Filter potential targets AND ensure they have a position
    const potentialTargets = entitiesToSearch.filter((entity): entity is Entity => {
        if (!entity) return false;
        // FIX 1: Remove incorrect .entity check. Just check for position.
        if (!entity.position) {
            // console.warn(`[CombatService] Filtered out entity ID ${entity.id} (Type: ${entity.type}, Name: ${entity.name || entity.username}) due to missing position.`);
            return false; // Skip entities without a position
        }

        if (targetIsPlayer) {
            return entity.type === 'player' && entity.username?.toLowerCase() === targetName.toLowerCase();
        } else {
            return entity.type === 'mob' && entity.name?.toLowerCase() === targetName.toLowerCase();
        }
    });

    console.log(`[CombatService] attack: Found ${potentialTargets.length} potential target(s) after filtering.`);

    if (potentialTargets.length === 0) {
      const message = `[CombatService] No valid ${targetIsPlayer ? 'player' : 'mob'} named "${targetName}" found nearby with complete data.`;
      console.log(message);
      throw new Error(`Target "${targetName}" not found or entity invalid.`);
    }

    // Find the closest among the valid targets
    const closestTarget = potentialTargets.reduce((nearest, currentTarget) => {
      try {
          const distToCurrent = this.bot.entity.position.distanceTo(currentTarget.position);
          const distToNearest = this.bot.entity.position.distanceTo(nearest.position);
          return distToCurrent < distToNearest ? currentTarget : nearest;
      } catch (e) {
           console.warn(`[CombatService] Error comparing distances during reduce: ${e}. Skipping comparison.`);
           return nearest;
      }
    });

    // --- Refined Final Check ---
    // FIX 2: Check closestTarget itself and its optional isValid property
    console.log(`[CombatService] Closest target selected: ID ${closestTarget?.id}, Type: ${closestTarget?.type}, Name: ${closestTarget?.username || closestTarget?.name}, IsValid: ${closestTarget?.isValid ?? 'N/A'}`);

    // Check if a target was selected and if it's considered valid (if the property exists)
    const isTargetValid = closestTarget && (closestTarget.isValid !== undefined ? closestTarget.isValid : true);

    if (!isTargetValid) {
        const errorMessage = `[CombatService] Could not resolve a valid entity for the nearest target "${targetName}" (ID: ${closestTarget?.id}). Target may be out of range, invalid, or despawned.`;
        console.warn(errorMessage);
        throw new Error(`Cannot attack "${targetName}": Target entity is invalid or missing.`);
    }
    // --- End Refined Check ---

    const targetType = targetIsPlayer ? 'player' : 'mob';
    console.log(`[CombatService] Attacking the nearest ${targetType} "${targetName}" (ID: ${closestTarget.id}) at ${closestTarget.position}...`);

    try {
      // FIX 3: Pass the closestTarget (the Entity object itself) directly
      pvp.attack(closestTarget);

      // Re-attack logic
      this.bot.once('stoppedAttacking', () => {
          // Fetch the entity again by ID to get the most current state
          const currentTargetEntity = this.bot.entities[closestTarget.id];
          // Check if it still exists and is valid
          if (currentTargetEntity && (currentTargetEntity.isValid !== false)) {
            console.log(`[CombatService] Target ${targetType} "${targetName}" (ID: ${closestTarget.id}) still alive after attack cycle.`);
            console.log('[CombatService] Re-initiating attack (recursive call - CAUTION).');
            this.attack(targetName).catch(err => {
                 console.error(`[CombatService] Error during recursive attack call: ${err}`);
            });
          } else {
            console.log(`[CombatService] Target ${targetType} "${targetName}" (ID: ${closestTarget.id}) killed, despawned, or invalid after attack.`);
          }
      });

    } catch (err: unknown) {
      const errMsg: string = err instanceof Error ? err.message : String(err);
      console.error(`[CombatService] Error during pvp.attack execution on ${targetType} "${targetName}": ${errMsg}`);
      throw new Error(`Attack execution failed: ${errMsg}`);
    }
  }
}