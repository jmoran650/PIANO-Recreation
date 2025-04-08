// src/actions/CombatService.ts
import dotenv from "dotenv";
import minecraftData from "minecraft-data"; // Included for consistency
import { Bot } from "mineflayer";
import { Block } from "prismarine-block"; // Included for consistency
import { Vec3 } from "vec3"; // Included for consistency
import { SharedAgentState } from "../sharedAgentState";
// No Navigation/Observer needed for this specific function

dotenv.config();

// NOTE: Module declaration might be better placed globally
declare module "mineflayer" {
  interface BotEvents {
    stoppedAttacking: () => void; // Relevant for attack logic
  }
}

export class CombatService {
  private bot: Bot;
  private mcData: any; // Keep for consistency
  private sharedState: SharedAgentState;

  constructor(
    bot: Bot,
    sharedState: SharedAgentState
    // navigation: Navigation // Not needed by attack
    // observer: Observer // Not needed by attack
  ) {
    this.bot = bot;
    this.sharedState = sharedState;
    if (process.env.MINECRAFT_VERSION == undefined) {
      // Added version check for mcData consistency
      throw new Error("[CombatService] Minecraft Version Undefined");
    }
    this.mcData = minecraftData(process.env.MINECRAFT_VERSION); // Initialize for consistency
  }

  /**
   * Attacks the nearest mob of the specified type using the mineflayer-pvp plugin.
   */
  async attack(mobType: string): Promise<void> {
    this.sharedState.addPendingAction(`Attack ${mobType}`);

    // Ensure pvp plugin is loaded (Original Check)
    const pvp = (this.bot as any).pvp;
    if (!pvp) {
      const errorMsg =
        "[CombatService] Error: mineflayer-pvp plugin not loaded. Attack action disabled.";
      console.log(errorMsg);
      // Should this throw or just return? Original threw.
      throw new Error(errorMsg);
    }

     // Check pvp.attack is callable (Original Check)
     if (typeof pvp.attack !== "function") {
         console.log("[CombatService] pvp.attack is not a function. Plugin mismatch or loading issue?");
         throw new Error("pvp.attack is not a function"); // Throw as it's unusable
     }


    // Find nearby mobs of the target type (Original Logic)
    // Use entity.name for mobs, entity.username for players
    const targetIsPlayer = this.bot.players[mobType] !== undefined; // Check if mobType matches a player name

    const entitiesToSearch = Object.values(this.bot.entities);
    const mobs = entitiesToSearch.filter( (entity: any) => {
        if (!entity) return false;
        if (targetIsPlayer) {
            // Target is a player
            return entity.type === 'player' && entity.username?.toLowerCase() === mobType.toLowerCase();
        } else {
            // Target is a mob
            // Use entity.name (e.g., 'zombie') or entity.displayName for named mobs?
            // Original used entity.name.toLowerCase() === mobType.toLowerCase()
             return entity.type === 'mob' && entity.name?.toLowerCase() === mobType.toLowerCase();
        }
    });


    if (mobs.length === 0) {
      console.log(`[CombatService] No ${mobType} found nearby to attack.`);
      return; // Nothing to attack
    }

    // Find the closest mob among the matches (Original Logic)
    const target = mobs.reduce((nearest: any, mob: any) => {
       // Ensure 'nearest' is valid before accessing position
       if (!nearest || !nearest.position) return mob;
       // Ensure 'mob' is valid before accessing position
       if (!mob || !mob.position) return nearest;

      const distToMob = this.bot.entity.position.distanceTo(mob.position);
      const distToNearest = this.bot.entity.position.distanceTo(nearest.position);
      return distToMob < distToNearest ? mob : nearest;
    }, mobs[0]); // Initial nearest is the first found mob

    // Ensure target and its entity are valid before attacking
    if (!target || !target.entity) {
        console.log(`[CombatService] Could not resolve valid entity for the nearest ${mobType}.`);
        return;
    }


    console.log(`[CombatService] Attacking the nearest ${mobType} (ID: ${target.id}) at ${target.position}...`);
    try {
      // Use the pvp plugin to attack (Original Logic)
      pvp.attack(target.entity); // Pass the entity object

      // Set up listener for when bot stops attacking (Original Logic)
      // Use once() to only trigger this callback once per attack command
      this.bot.once("stoppedAttacking", () => {
          // Check if the target still exists after attacking stopped
          // Need to re-fetch the entity as the original reference might be stale
          const currentTargetEntity = this.bot.entities[target.id];
          if (currentTargetEntity) {
            console.log(`[CombatService] Target ${mobType} (ID: ${target.id}) still alive after attack cycle.`);
            // Original code recursively called this.attack(mobType) here.
            // This could lead to infinite loops if the bot can't kill the mob.
            // Consider adding a max retry or delay instead.
            // Preserving exact behavior:
             console.log("[CombatService] Re-attacking target.");
             this.attack(mobType); // Recursive call
          } else {
            console.log(`[CombatService] Target ${mobType} (ID: ${target.id}) seems to be killed or despawned.`);
          }
      });

    } catch (err: unknown) { // Catch unknown type
      const errMsg: string = err instanceof Error ? err.message : String(err); // Safely get error message
      console.log(`[CombatService] Error during pvp.attack on ${mobType}: ${errMsg}`);
      // Don't re-throw here? Let the action fail somewhat gracefully.
    }
  }
}