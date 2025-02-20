// src/observer.ts

import { Bot } from "mineflayer";
import type { Entity } from "prismarine-entity";
import type { Block } from "prismarine-block";
import Vec3 from "vec3";

type Vec3Type = ReturnType<typeof Vec3>;

export interface ObserverOptions {
  radius?: number;
}

export class Observer {
  private bot: Bot;
  private radius: number;

  constructor(bot: Bot, options: ObserverOptions = {}) {
    this.bot = bot;
    this.radius = options.radius ?? 16;
  }

  /**
   * Returns an object describing each unique block type (other than air)
   * within `this.radius` of the bot, along with coordinates of the closest
   * block of that type.
   *
   * Example return:
   * {
   *   BlockTypes: {
   *     dirt: { x: 12, y: 64, z: 7 },
   *     sand: { x: 14, y: 65, z: 9 }
   *   }
   * }
   */
  public async getVisibleBlockTypes(): Promise<{
    BlockTypes: {
      [blockName: string]: { x: number; y: number; z: number };
    };
  }> {
    await this.bot.waitForChunksToLoad();

    // 1. Find all positions within the given radius that match any non-air block.
    //    We'll allow up to a large count (9999) so we get as many blocks as possible.
    const positions = this.bot.findBlocks({
      point: this.bot.entity.position,
      maxDistance: this.radius,
      matching: (block: Block | null) => {
        // We only match blocks that exist and are not air
        return block !== null && block.name !== "air";
      },
      count: 9999,
    });

    // 2. Map each position to { blockName, distance, pos } and group them by blockName.
    //    We'll keep only the single closest block for each blockName.
    interface BlockInfo {
      blockName: string;
      distance: number;
      pos: Vec3Type;
    }

    const blockInfos: BlockInfo[] = [];
    const botPos = this.bot.entity.position;

    for (const pos of positions) {
      const block = this.bot.blockAt(pos) as Block | null;
      if (!block) continue;

      const distance = botPos.distanceTo(pos);
      blockInfos.push({
        blockName: block.name,
        distance,
        pos,
      });
    }

    // 3. Group by blockName, pick the closest block for each group.
    const closestByType: {
      [key: string]: { distance: number; pos: Vec3Type };
    } = {};

    for (const info of blockInfos) {
      const existing = closestByType[info.blockName];
      if (!existing || info.distance < existing.distance) {
        closestByType[info.blockName] = {
          distance: info.distance,
          pos: info.pos,
        };
      }
    }

    // 4. Build the final return structure
    const result: {
      BlockTypes: {
        [blockName: string]: { x: number; y: number; z: number };
      };
    } = { BlockTypes: {} };

    for (const blockName of Object.keys(closestByType)) {
      const { pos } = closestByType[blockName];
      result.BlockTypes[blockName] = { x: pos.x, y: pos.y, z: pos.z };
    }

    return result;
  }

  /**
   * Returns an object containing a list of mobs within `this.radius`,
   * each with its name and distance from the bot. Not grouped by type.
   *
   * Example return:
   * {
   *   Mobs: [
   *     { name: 'Skeleton', distance: 10.2 },
   *     { name: 'Creeper', distance: 12.7 },
   *     { name: 'Zombie', distance: 14.1 }
   *   ]
   * }
   */
  public async getVisibleMobs(): Promise<{
    Mobs: { name: string; distance: number }[];
  }> {
    await this.bot.waitForChunksToLoad();
    const center = this.bot.entity.position;
    const result = { Mobs: [] as { name: string; distance: number }[] };

    for (const id in this.bot.entities) {
      const entity = this.bot.entities[id] as Entity;

      // Ignore the bot itself and any players (players have a 'username' property).
      if (entity === this.bot.entity || (entity as any).username) continue;

      // Check the distance from the bot.
      const dist = center.distanceTo(entity.position);
      if (dist <= this.radius) {
        // entity.name is often a lowercase string like 'cow', 'zombie', etc.
        // If entity.name is missing or capitalized, adjust as needed.
        result.Mobs.push({
          name: entity.name ?? "unknown_mob",
          distance: parseFloat(dist.toFixed(2)),
        });
      }
    }

    return result;
  }

  //TODO: biome determination

  //TODO: relative location determination i.e. am I underground or on the surface?

  //TODO: Hearing

  //TODO: observe inventory

  //TODO: Time awareness
}
