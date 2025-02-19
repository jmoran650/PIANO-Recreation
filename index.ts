// index.ts
import mineflayer, {Bot} from 'mineflayer'
import {PathfinderBot} from './types/bot-types'
import { mineflayer as mineflayerViewer } from 'prismarine-viewer'
import { Observer } from './src/observer'
import 'mineflayer-pathfinder'

// Import pathfinder, Movements, and goals
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder')
const minecraftData = require('minecraft-data')

const mcData = minecraftData('1.21.4')

const bot: Bot = mineflayer.createBot({
  host: 'localhost',
  port: 37269,
  auth: 'offline',
  username: 'AgentBot',
  version: '1.21.4'
})

const observer = new Observer(bot, { radius: 20 })

function welcome() {
  bot.chat('hi there!')
}

bot.once('spawn', async () => {
  // 1. Launch the prismarine viewer for visualization (optional)
  mineflayerViewer(bot, { port: 3000, firstPerson: false })

  // 2. Greet
  welcome()

  // 3. Wait for chunks to load
  await bot.waitForChunksToLoad()

  // 4. Load the pathfinder plugin
  bot.loadPlugin(pathfinder)

  // 5. Set default movements (so the bot can navigate)
  const defaultMovements = new Movements(bot)
  bot.pathfinder.setMovements(defaultMovements)
})

bot.on('error', (err: Error) => {
  bot.chat(`${err.name} ${err.message}`)
  console.log('\n ERROR ERROR ERROR \n', err, '\n ERROR ERROR ERROR \n')
})

// Listen for any chat message.
bot.on('chat', async (username: string, message: string) => {
  // Ignore our own messages.
  if (username === bot.username) return

  // Handle the "blocks" command - just logs visible blocks.
  if (message === 'blocks') {
    const visibleBlocksResult = await observer.getVisibleBlockTypes()
    const blocksStr = Object.entries(visibleBlocksResult.BlockTypes)
      .map(([blockName, { x, y, z }]) => `${blockName} at (${x}, ${y}, ${z})`)
      .join(', ')
    bot.chat(`Visible Blocks: ${blocksStr || 'None'}`)
  }

  // Handle the "mobs" command - logs visible mobs.
  if (message === 'mobs') {
    const visibleMobsResult = await observer.getVisibleMobs()
    const mobsStr = visibleMobsResult.Mobs
      .map(mob => `${mob.name} (${mob.distance} away)`)
      .join(', ')
    bot.chat(`Visible Mobs: ${mobsStr || 'None'}`)
  }

  // Handle the "wood" command - navigate to the nearest wood-like block (log/wood/plank).
  if (message === 'wood') {
    // 1. Get visible blocks
    const visibleBlocksResult = await observer.getVisibleBlockTypes()
    const blockTypes = visibleBlocksResult.BlockTypes

    // 2. Find block names that might represent wood (common naming patterns: log, wood, plank)
    const woodCandidates = Object.keys(blockTypes).filter(
      name => name.includes('log') || name.includes('wood') || name.includes('plank')
    )

    if (woodCandidates.length === 0) {
      bot.chat('No trees nearby')
      return
    }

    // 3. Take the first matching wood type; Observer picks the closest block for each type
    const woodName = woodCandidates[0]
    const { x, y, z } = blockTypes[woodName]

    bot.chat(`Moving to the nearest wood block: ${woodName} at (${x}, ${y}, ${z})`)

    // 4. Pathfind to the wood block location
    const goal = new GoalBlock(x, y, z)
    await bot.pathfinder.goto(goal)

    bot.chat('Arrived at the wood block!')
  }
})