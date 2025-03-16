// createAgentBot.ts
import mineflayer, { Bot } from "mineflayer";
import { pathfinder, Movements } from "mineflayer-pathfinder";
import { plugin as pvp } from "mineflayer-pvp";
import minecraftData from "minecraft-data";
import OpenAI from "openai";
import { SharedAgentState } from "./src/sharedAgentState";
import { Memory } from "./src/memory";
import { Social } from "./src/social";
import { Goals } from "./src/goals";
import { Observer } from "./src/observer";
import { Navigation } from "./src/navigation";
import { Actions } from "./src/actions";
import { CognitiveController } from "./src/cc";
// NEW IMPORTS FOR FUNCTIONCALLER:
import { FunctionCaller } from "./src/functions/functionCalling";

export interface BotOptions {
  host: string;
  port: number;
  username: string;
  version?: string;
}

export interface AgentBot {
  bot: Bot;
  sharedState: SharedAgentState;
  memory: Memory;
  social: Social;
  goals: Goals;
  observer: Observer;
  navigation: Navigation;
  actions: Actions;
  cc: CognitiveController;
  functionCaller: FunctionCaller;
}

export async function createAgentBot(options: BotOptions): Promise<AgentBot> {

  console.log("attempting to create and connect bot! \n");
  // 1. Create the bot.
  const bot: Bot = mineflayer.createBot({
    host: options.host,
    port: options.port,
    username: options.username,
    version: options.version,
    viewDistance: "far",
  });
  // 2. Wait for spawn.
  await new Promise<void>((resolve, reject) => {
    bot.once("spawn", () => resolve());
    bot.once("error", (err) => reject(err));
  });

  // 3. Load plugins.
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  // 4. Set up pathfinder movements.
  const defaultMovements = new Movements(bot);
  defaultMovements.maxDropDown = 100;
  defaultMovements.canOpenDoors = true;
  bot.pathfinder.setMovements(defaultMovements);

  // 5. Set up shared state and modules.
  const sharedState = new SharedAgentState();
  const memory = new Memory(sharedState);
  const social = new Social(sharedState);
  const goals = new Goals(sharedState);
  const observer = new Observer(bot, { radius: 2000 }, sharedState);
  const navigation = new Navigation(bot);
  const actions = new Actions(bot, navigation, sharedState);
  const cc = new CognitiveController(
    bot,
    sharedState,
    memory,
    social,
    goals,
    observer,
    actions
  );

  // 6. Create an OpenAI client and the FunctionCaller instance:
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const functionCaller = new FunctionCaller(actions, sharedState, openai);

  bot.chat("Hello, I've been created by createAgentBot!");

  cc.startConcurrentLoops();

  // 7. Return all the components.
  return {
    bot,
    sharedState,
    memory,
    social,
    goals,
    observer,
    navigation,
    actions,
    cc,
    functionCaller,
  };
}
