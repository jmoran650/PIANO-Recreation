// index.ts
import mineflayer, { Bot } from "mineflayer";
import { mineflayer as mineflayerViewer } from "prismarine-viewer";
import { Observer } from "./src/observer";
import "mineflayer-pathfinder";
import { pathfinder, Movements, goals } from "mineflayer-pathfinder";
import minecraftData from "minecraft-data";
//import { Vec3 } from "vec3";
import { plugin as pvp } from 'mineflayer-pvp';
import { Navigation } from "./src/navigation";
import { Actions } from "./src/actions";

// in index.ts or wherever you initialize the bot:
import { SharedAgentState } from "./src/sharedAgentState";

const sharedAgentState = new SharedAgentState();

let navigation: Navigation | null = null;
let actions: Actions | null = null;

const mcData = minecraftData("1.21.4");

const bot: Bot = mineflayer.createBot({
  host: "localhost",
  port: 37269,
  auth: "offline",
  username: "AgentBot",
  //version: "1.21.4",
});

const observer = new Observer(bot, { radius: 200 });

function welcome() {
  bot.chat("hi there!");
}

bot.once("spawn", async () => {
  // 1. (Optional) Launch the prismarine viewer for visualization
  // mineflayerViewer(bot, { port: 3000, firstPerson: false });

  // 2. Greet
  welcome();

  // 3. Wait for chunks to load
  await bot.waitForChunksToLoad();

  // 4. Load the pathfinder plugin and pvp plugin
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  // 5. Create an instance of our Navigation class
  navigation = new Navigation(bot);

  // 6. Set default movements (so the bot can navigate).
  const defaultMovements = new Movements(bot);
  bot.pathfinder.setMovements(defaultMovements);

  // 7. Instantiate our Actions class
  actions = new Actions(bot, navigation);

  bot.chat("I'm ready to go!");
});

// Listen for any chat message
bot.on("chat", async (username: string, message: string) => {
  // Ignore our own messages
  if (username === bot.username) return;

  // Handle existing commands
  if (message === "blocks") {
    const visibleBlocksResult = await observer.getVisibleBlockTypes();
    const blocksStr = Object.entries(visibleBlocksResult.BlockTypes)
      .map(([blockName, { x, y, z }]) => `${blockName} at (${x}, ${y}, ${z})`)
      .join(", ");
    bot.chat(`Visible Blocks: ${blocksStr || "None"}`);
  } else if (message === "home") {
    bot.chat("/tp -124 62 28");
  } else if (message === "tome") {
    bot.chat("/tp jibbum");
  } else if (message === "mobs") {
    const visibleMobsResult = await observer.getVisibleMobs();
    const mobsStr = visibleMobsResult.Mobs
      .map((mob) => `${mob.name} (${mob.distance} away)`)
      .join(", ");
    bot.chat(`Visible Mobs: ${mobsStr || "None"}`);
  } else if (message === "wood") {
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
    bot.chat(`Moving to the nearest wood block: ${woodName} at (${x}, ${y}, ${z})`);
    await bot.pathfinder.goto(new goals.GoalBlock(x, y, z));
    bot.chat("Arrived at the wood block!");
  } else if (message === "move") {
    const { x, y, z } = bot.entity.position;
    const targetX = Math.floor(x + 10);
    const targetY = Math.floor(y);
    const targetZ = Math.floor(z);

    bot.chat(`Moving 10 blocks away to ( ${targetX}, ${targetY}, ${targetZ} )...`);
    if (!navigation) {
      bot.chat("Navigation is not ready yet!");
      return;
    }
    await navigation.move(targetX, targetY, targetZ);
    bot.chat("Arrived at new location!");
  }

  // ==========================
  // TESTS FOR ACTIONS CLASS
  // ==========================
  // Example usage:
  // 1) "test mine <blockName> <count>"
  // 2) "test craft <itemName>"
  // 3) "test place <blockType>"
  // 4) "test attack <mobType>"
  // 5) "test safetable"  <-- New command to test safe placement of a crafting table
  //
  // e.g.:
  //   test mine iron_ore 3
  //   test craft crafting_table
  //   test place furnace
  //   test attack zombie
  //   test safetable
  // ==========================

  if (message.startsWith("test ")) {
    if (!actions) {
      bot.chat("Actions are not available yet.");
      return;
    }
    const parts = message.split(" ");
    // parts[0] = 'test'
    // parts[1] = subcommand e.g. 'mine', 'craft', 'place', 'attack', or 'safetable'
    const subcommand = parts[1];

    switch (subcommand) {
      case "mine": {
        // e.g. "test mine iron_ore 3"
        bot.chat("So you want me to mine, eh?");
        const blockName = parts[2];
        const desiredCount = parseInt(parts[3] || "1", 10);
        if (!blockName) {
          bot.chat("Usage: test mine <blockName> [count]");
          return;
        }
        await actions.mine(blockName, desiredCount);
        break;
      }
      case "craft": {
        // e.g. "test craft crafting_table"
        const itemName = parts[2];
        if (!itemName) {
          bot.chat("Usage: test craft <itemName>");
          return;
        }
        await actions.craft(itemName);
        break;
      }
      case "place": {
        // e.g. "test place furnace"
        const blockType = parts[2];
        if (!blockType) {
          bot.chat("Usage: test place <blockType>");
          return;
        }
        await actions.place(blockType);
        break;
      }
      case "attack": {
        // e.g. "test attack zombie"
        const mobType = parts[2];
        if (!mobType) {
          bot.chat("Usage: test attack <mobType>");
          return;
        }
        await actions.attack(mobType);
        break;
      }
      case "safetable": {
        // e.g. "test safetable"
        await actions.placeCraftingTable();
        break;
      }
      case "usetable": {
        // New test command to use a nearby crafting table
        await actions.useCraftingTable();
        break;
      }
      default:
        bot.chat(
          "Unknown test command. Valid subcommands: mine, craft, place, attack, safetable"
        );
        break;
    }
  }
});

bot.on("error", async (err) => {
  console.log(err);
});