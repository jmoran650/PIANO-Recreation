// index.ts
import mineflayer, { Bot } from "mineflayer";
import { mineflayer as mineflayerViewer } from "prismarine-viewer";
import { Observer } from "./src/observer";
import "mineflayer-pathfinder";
import { pathfinder, Movements, goals } from "mineflayer-pathfinder";
import minecraftData from "minecraft-data";
import { Vec3 } from "vec3";

// Import our new Movement class
import { Navigation } from "./src/navigation";
import { error } from "console";
// instantiate global movement variable
let navigation: Navigation | null = null;

const mcData = minecraftData("1.21.4");

const bot: Bot = mineflayer.createBot({
  host: "localhost",
  port: 37269,
  auth: "offline",
  username: "AgentBot",
  version: "1.21.4",
});


const observer = new Observer(bot, { radius: 200 });

function welcome() {
  bot.chat("hi there!");
}

bot.once("spawn", async () => {

  // 1. Launch the prismarine viewer for visualization (optional)
  //mineflayerViewer(bot, { port: 3000, firstPerson: false })

  // 2. Greet
  welcome();

  // 3. Wait for chunks to load
  await bot.waitForChunksToLoad();

  // 4. Load the pathfinder plugin
  bot.loadPlugin(pathfinder);
  // Create an instance of our Movement class
  navigation = new Navigation(bot);
  // 5. Set default movements (so the bot can navigate).
  //    You can also do this inside the Movement class if you prefer.
  const defaultMovements = new Movements(bot);
  bot.pathfinder.setMovements(defaultMovements);

  bot.chat("I'm ready to go!");

});

// Listen for any chat message
bot.on("chat", async (username: string, message: string) => {
  // Ignore our own messages
  if (username === bot.username) return;

  // Handle the "blocks" command
  if (message === "blocks") {
    const visibleBlocksResult = await observer.getVisibleBlockTypes();
    const blocksStr = Object.entries(visibleBlocksResult.BlockTypes)
      .map(([blockName, { x, y, z }]) => `${blockName} at (${x}, ${y}, ${z})`)
      .join(", ");
    bot.chat(`Visible Blocks: ${blocksStr || "None"}`);
  }
  if (message === "home") {
    bot.chat("/tp -124 62 28");
  }

  if (message === "tome") {
    bot.chat("/tp jibbum")
  }

  // Handle the "mobs" command
  else if (message === "mobs") {
    const visibleMobsResult = await observer.getVisibleMobs();
    const mobsStr = visibleMobsResult.Mobs.map(
      (mob) => `${mob.name} (${mob.distance} away)`
    ).join(", ");
    bot.chat(`Visible Mobs: ${mobsStr || "None"}`);
  }

  // Handle the "wood" command (existing logic)
  else if (message === "wood") {
    const visibleBlocksResult = await observer.getVisibleBlockTypes();
    const blockTypes = visibleBlocksResult.BlockTypes;

    const woodCandidates = Object.keys(blockTypes).filter(
      (name) =>
        name.includes("log") || name.includes("wood") || name.includes("plank")
    );

    if (woodCandidates.length === 0) {
      bot.chat("No trees nearby");
      return;
    }

    const woodName = woodCandidates[0];
    const { x, y, z } = blockTypes[woodName];

    bot.chat(
      `Moving to the nearest wood block: ${woodName} at (${x}, ${y}, ${z})`
    );
    await bot.pathfinder.goto(new goals.GoalBlock(x, y, z));
    bot.chat("Arrived at the wood block!");
  }

  // Handle the "move" command
  else if (message === "move") {
    //const movement = new Movement(bot)
    // Choose a spot 10 blocks in front of the bot (along the X-axis in this example)
    const { x, y, z } = bot.entity.position;
    const targetX = Math.floor(x + 10); // pick a direction or random
    const targetY = Math.floor(y);
    const targetZ = Math.floor(z);

    bot.chat(
      `Moving 10 blocks away to ( ${targetX}, ${targetY}, ${targetZ} )...`
    );
    if(!navigation){
      bot.chat("Navigation is not ready yet!");
      return;
    }
    await navigation.move(targetX, targetY, targetZ);
    bot.chat("Arrived at new location!");
  }
});

bot.on("error", async (error) => {
  console.log(error);
});
