// createAgentBot.ts
import mineflayer, { Bot } from "mineflayer";
import { Movements, pathfinder } from "mineflayer-pathfinder";
import { plugin as pvp } from "mineflayer-pvp";
import OpenAI from "openai";
import { Actions } from "./actions";
import { Memory } from "./functions/memory/memory";
import { Social } from "./functions/social/social";
import { Goals } from "./goals";
import { Navigation } from "./navigation";
import { Observer } from "./observer/observer";
import { SharedAgentState } from "./sharedAgentState";
// NEW IMPORTS FOR FUNCTIONCALLER:
import { FunctionCaller } from "./functions/functionCalling";

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
  // cc: CognitiveController;
  functionCaller: FunctionCaller;
}

export async function createAgentBot(options: BotOptions): Promise<AgentBot> {
  console.log(`attempting to create and connect bot: ${options.username}\n`);
  // 1. Create the bot.
  const bot: Bot = mineflayer.createBot({
    host: options.host,
    port: options.port,
    username: options.username,
    version: options.version,
    viewDistance: 100,
  });
  // 2. Wait for spawn.
  await new Promise<void>((resolve, reject) => {
    bot.once("spawn", () => resolve());
    bot.once("error", (err) => reject(err));
  });

  //bot.world.setMaxListeners(0);

  bot.waitForChunksToLoad();

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

  const navigation = new Navigation(bot);

  const observer = new Observer(bot, { radius: 80 }, sharedState);

  const actions = new Actions(bot, navigation, sharedState, observer);
  // const cc = new CognitiveController(
  //   bot,
  //   sharedState,
  //   memory,
  //   social,
  //   goals,
  //   observer,
  //   actions
  // );

  // 6. Create an OpenAI client and the FunctionCaller instance:
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const functionCaller = new FunctionCaller(
    actions,
    sharedState,
    openai,
    memory,
    social,
    observer
  );

  //cc.startConcurrentLoops();

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
    //cc,
    functionCaller,
  };
}
