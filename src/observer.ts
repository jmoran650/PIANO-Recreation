// src/observer.ts
import { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'
import Vec3 from 'vec3'

// Create a type alias for an instance of Vec3
type Vec3Type = ReturnType<typeof Vec3>

export interface ObserverOptions {
  radius?: number
}

export class Observer {
  private bot: Bot
  private radius: number

  constructor(bot: Bot, options: ObserverOptions = {}) {
    this.bot = bot
    this.radius = options.radius ?? 16
  }

  // Returns an array of blocks (objects) that are visible to the bot.
  public findVisibleBlocks(): any[] {
    const startTime = Date.now()
    const blockPositions = this.bot.findBlocks({
      point: this.bot.entity.position,
      maxDistance: this.radius,
      matching: () => true // Match all blocks
    })

    const visibleBlocks = blockPositions
      .map((pos: Vec3Type) => this.bot.blockAt(pos))
      .filter((block: any) => block && this.bot.canSeeBlock(block))

    const endTime = Date.now()
    console.log(`findVisibleBlocks took ${endTime - startTime} ms`)
    return visibleBlocks
  }

  // Returns an array of mobs (non-player entities) visible to the bot.
  public async findVisibleMobs(): Promise<Entity[]> {
    const startTime = Date.now()
    await this.bot.waitForChunksToLoad()
    const visibleMobs: Entity[] = []

    console.log("OBSERVER entities from observer: ", this.bot.entities)
    console.log("OBSERVER Nearest entity", this.bot.nearestEntity())

    // Since Entity does not have eyeHeight, use a fallback:
    // try (this.bot.entity as any).eyeHeight or compute 80% of its height.
    const eyeHeight = (this.bot.entity as any).eyeHeight ?? this.bot.entity.height * 0.8
    const eyePos = this.bot.entity.position.offset(0, eyeHeight, 0)
    
    for (const id in this.bot.entities) {
      const entity = this.bot.entities[id] as Entity
      // Skip our own entity and players (players have a 'username' property)
      if (entity === this.bot.entity || (entity as any).username) continue

      // Use entity's approximate eye height (default to 1.0 if not provided)
      const mobEyeHeight = (entity as any).height || 1.0
      const mobEyePos = entity.position.offset(0, mobEyeHeight * 0.8, 0)
      const distance = eyePos.distanceTo(mobEyePos)
      if (distance > this.radius) continue

      visibleMobs.push(entity)
    }
    const endTime = Date.now()
    console.log(`findVisibleMobs took ${endTime - startTime} ms`)
    console.log("visible mobs: ", visibleMobs)
    return visibleMobs
  }

  // A simple raycasting function that returns true if the line of sight is clear
  // between two Vec3 points.
  public lineOfSightClear(start: Vec3Type, end: Vec3Type): boolean {
    const distance = start.distanceTo(end)
    const step = 0.5
    const steps = Math.ceil(distance / step)
    const delta = end.minus(start).scaled(1 / steps)
    let current = start.clone()
    for (let i = 0; i < steps; i++) {
      const block = this.bot.blockAt(current)
      // If a block is found and it's not air, assume it obstructs the view.
      if (block && block.name !== 'air') {
        return false
      }
      current = current.plus(delta)
    }
    return true
  }
}