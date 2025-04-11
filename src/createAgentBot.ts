// src/createAgentBot.ts

import mineflayer, { Bot } from 'mineflayer';
import { Movements, pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import OpenAI from 'openai';
// import { Actions } from "./actions"; // Remove the old import

// Import the new individual action services
import { BuildingService } from './actions/build';
import { CombatService } from './actions/combat';
import { CraftingService } from './actions/craft';
import { FarmingService } from './actions/farm';
import { InventoryService } from './actions/inventory';
import { MiningService } from './actions/mine';
import { MovementService } from './actions/move';
import { SmeltingService } from './actions/smelt';
import { TalkService } from './actions/talk';
import { ActionServices } from '../types/actionServices.types';
import { Memory } from './functions/memory/memory';
import { Social } from './functions/social/social';
import { Goals } from './goals';
import { Navigation } from './navigation';
import { Observer } from './observer/observer';
import { SharedAgentState } from './sharedAgentState';
import { FunctionCaller } from './functions/functionCalling';

export interface BotOptions {
  host: string;
  port: number;
  username: string;
  acronym?: string;
  version?: string;
}

// Update the AgentBot interface to hold individual services
export interface AgentBot {
  bot: Bot;
  sharedState: SharedAgentState;
  memory: Memory;
  social: Social;
  goals: Goals;
  observer: Observer;
  navigation: Navigation;
  functionCaller: FunctionCaller; // Keep FunctionCaller
  actionServices: ActionServices;
  // Remove the old monolithic actions
  // actions: Actions;
}

export async function createAgentBot(options: BotOptions): Promise<AgentBot> {
  console.log(`attempting to create and connect bot: ${options.username}\n`);
  const bot: Bot = mineflayer.createBot({
    host: options.host,
    port: options.port,
    username: options.username,
    version: options.version,
    viewDistance: 100,
  });

  await new Promise<void>((resolve, reject) => {
    bot.once('spawn', () => resolve());
    bot.once('error', (err) => reject(err));
  });

  bot.waitForChunksToLoad();
  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  const defaultMovements = new Movements(bot);
  defaultMovements.maxDropDown = 100;
  defaultMovements.canOpenDoors = true;
  bot.pathfinder.setMovements(defaultMovements);

  const sharedState = new SharedAgentState(options.username);
  const memory = new Memory(sharedState);
  const social = new Social(sharedState);
  const goals = new Goals(sharedState);
  const navigation = new Navigation(bot);
  const observer = new Observer(bot, { radius: 80 }, sharedState);

  // Instantiate the new services, respecting dependency order
  const buildingService = new BuildingService(bot, sharedState);
  const combatService = new CombatService(bot, sharedState);
  const craftingService = new CraftingService(bot, navigation, sharedState, observer);
  const farmingService = new FarmingService(bot, navigation, sharedState);
  const inventoryService = new InventoryService(bot, sharedState);
  const miningService = new MiningService(bot, navigation, sharedState);
  const movementService = new MovementService(bot, navigation, sharedState);
  const talkService = new TalkService(bot);
  const smeltingService = new SmeltingService(bot, sharedState, craftingService, buildingService);
  const actionServices: ActionServices = {
    buildingService,
    combatService,
    craftingService,
    farmingService,
    inventoryService,
    miningService,
    movementService,
    smeltingService,
    talkService,
};
  // Remove the old Actions instantiation
  // const actions = new Actions(bot, navigation, sharedState, observer);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // IMPORTANT: FunctionCaller needs to be updated separately
  // It currently expects the old 'Actions' class. You'll need to modify
  // FunctionCaller's constructor and internal logic to accept and use
  // the *new individual services* instead of the 'actions' object.
  // For now, we comment out its instantiation or pass null/undefined
  // if its type allows, until FunctionCaller is refactored.

  // TODO: Refactor FunctionCaller to accept individual services
  // Placeholder: Creating FunctionCaller might fail or need adjustment
  // depending on how you refactor it. Passing null for actions for now.
  const functionCaller = new FunctionCaller(
    bot,

    sharedState,
    openai,
    memory,
    social,
    observer,
    actionServices
  );

  // Return the object conforming to the updated AgentBot interface
  return {
    bot,
    sharedState,
    memory,
    social,
    goals,
    observer,
    navigation,
    functionCaller, // Still needs refactoring internally
    actionServices
  };
}