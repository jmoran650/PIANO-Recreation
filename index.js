
const mineflayer = require('mineflayer')
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
const bot = mineflayer.createBot()

const welcome = () => {
    bot.chat('hi!')
  }


bot.once('spawn', () => {
  mineflayerViewer(bot, { port: 3007, firstPerson: true });
  welcome();
   // port is the minecraft server port, if first person is false, you get a bird's-eye view
})

