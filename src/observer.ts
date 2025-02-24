// src/observer.ts
import { Bot } from "mineflayer";
import type { Entity } from "prismarine-entity";
import type { Block } from "prismarine-block";
import { Vec3 } from "vec3";
import { SharedAgentState } from "./sharedAgentState";

// Define observer options locally to avoid circular imports.
export interface IObserverOptions {
  radius?: number;
}

// Use Vec3 directly as the instance type.
type Vec3Type = Vec3;

export class Observer {
  private bot: Bot;
  private radius: number;
  private sharedState: SharedAgentState;

  constructor(bot: Bot, options: IObserverOptions = {}, sharedState: SharedAgentState) {
    this.bot = bot;
    this.radius = options.radius ?? 16;
    this.sharedState = sharedState;
  }

  /**
   * Returns an object describing each unique block type (other than air)
   * within `this.radius` of the bot, along with coordinates of the closest
   * block of that type.
   */
  public async getVisibleBlockTypes(): Promise<{
    BlockTypes: { [blockName: string]: { x: number; y: number; z: number } };
  }> {
    await this.bot.waitForChunksToLoad();

    const positions = this.bot.findBlocks({
      point: this.bot.entity.position,
      maxDistance: this.radius,
      matching: (block: Block | null) => block !== null && block.name !== "air",
      count: 9999,
    });

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

    const closestByType: { [key: string]: { distance: number; pos: Vec3Type } } = {};
    for (const info of blockInfos) {
      const existing = closestByType[info.blockName];
      if (!existing || info.distance < existing.distance) {
        closestByType[info.blockName] = { distance: info.distance, pos: info.pos };
      }
    }

    const result: { BlockTypes: { [blockName: string]: { x: number; y: number; z: number } } } = { BlockTypes: {} };
    for (const blockName of Object.keys(closestByType)) {
      const { pos } = closestByType[blockName];
      result.BlockTypes[blockName] = { x: pos.x, y: pos.y, z: pos.z };
    }

    this.sharedState.visibleBlockTypes = result;
    return result;
  }

  /**
   * Returns an object containing a list of mobs within `this.radius`.
   */
  public async getVisibleMobs(): Promise<{ Mobs: { name: string; distance: number }[] }> {
    await this.bot.waitForChunksToLoad();

    const center = this.bot.entity.position;
    const result = { Mobs: [] as { name: string; distance: number }[] };

    for (const id in this.bot.entities) {
      const entity = this.bot.entities[id] as Entity;
      if (!entity || entity === this.bot.entity || (entity as any).username) continue;
      const dist = center.distanceTo(entity.position);
      if (dist <= this.radius) {
        const name = entity.name ?? "unknown_mob";
        result.Mobs.push({ name, distance: parseFloat(dist.toFixed(2)) });
      }
    }

    this.sharedState.visibleMobs = result;
    return result;
  }
}