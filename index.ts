// index.ts
import mineflayer, { Bot } from 'mineflayer'
import { mineflayer as mineflayerViewer } from 'prismarine-viewer'
import { Observer } from './src/observer'

const bot: Bot = mineflayer.createBot({
  host: 'localhost',
  port: 37269,
  username: 'AgentBot',
  version: '1.21.4'
})

function welcome() {
  bot.chat('hi there!')
}

bot.once('spawn', async () => {
  // Launch the prismarine viewer for visualization
  mineflayerViewer(bot, { port: 3000, firstPerson: false })
  welcome()
  await bot.waitForChunksToLoad()

  bot.on('error', (err: Error) => {
    bot.chat(`${err.name} ${err.message}`)
    console.log('\n ERROR ERROR ERROR \n', err, '\n ERROR ERROR ERROR \n')
  })

  bot.on('chat', (username: string) => {
    if (username === bot.username) return
    const visibleBlocks = observer.findVisibleBlocks()
    bot.chat(visibleBlocks.toString())
  })

  const observer = new Observer(bot, { radius: 160 })
})