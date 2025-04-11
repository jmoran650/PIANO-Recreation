// src/functions/functionCalling.ts
import OpenAI from 'openai';
import minecraftData from 'minecraft-data';
import { Bot } from 'mineflayer';
import { ActionServices } from '../../types/actionServices.types';
import { minecraftBlocks, minecraftItems } from '../../data/minecraftItems';
import { Observer } from '../observer/observer';
import { SharedAgentState } from '../sharedAgentState';
import { Memory } from './memory/memory';
import { Social } from './social/social';
import { tools } from './tools';
import fs from 'fs/promises';
import path from 'path';
import {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions'; // Import specific types
import { LogEntry } from '../../types/log.types'; // Import LogEntry type

// Type for the action registry
type ActionFunction = (args: any) => Promise<string>; // All actions will return a result string
type ActionRegistry = Map<string, ActionFunction>;

// Define the roles acceptable by sharedState.logMessage
type LoggableRole = LogEntry['role'];
const LOGGABLE_ROLES = new Set<LoggableRole>([
  'user',
  'assistant',
  'system',
  'function',
  'api_request',
  'api_response',
  'api_error',
  'memory',
]);

export class FunctionCaller {
  private lastDiffStateSnapshot: {
    health: number;
    hunger: number;
    visibleMobs: { name: string; distance: number }[];
  } | null = null;
  private readonly MOB_DISTANCE_CHANGE_THRESHOLD = 0.15;
  private mcData: any;
  private actionRegistry: ActionRegistry; // The registry for tool functions

  constructor(
    private bot: Bot,
    private sharedState: SharedAgentState,
    private openai: OpenAI,
    private memory: Memory,
    private social: Social,
    private observer: Observer,
    private actionService: ActionServices // Renamed for clarity
  ) {
    if (!this.bot.version) {
      throw new Error(
        '[FunctionCaller] Bot version is not available to initialize minecraft-data.'
      );
    }
    this.mcData = minecraftData(this.bot.version);
    if (!this.mcData) {
      throw new Error(
        `[FunctionCaller] Failed to load minecraft-data for version ${this.bot.version}.`
      );
    }
    // Initialize the action registry
    this.actionRegistry = this._buildActionRegistry();
  }

  // --- Public Methods ---

  public getSharedStateAsText(): string {
    return this.sharedState.getSharedStateAsText();
  }

  /**
   * Calculates and returns a textual description of significant state changes
   * since the last call. Updates the internal snapshot.
   */
  public getSharedStateDiffAsText(): string {
    const currentState = this.sharedState;
    const previousSnapshot = this.lastDiffStateSnapshot;

    // Initialize snapshot on first call
    if (!previousSnapshot) {
      this.lastDiffStateSnapshot = this._createStateSnapshot(currentState);
      return 'State diff unavailable on first call; capturing current state.';
    }

    const differences: string[] = [];

    // Check basic stats
    if (currentState.botHealth !== previousSnapshot.health) {
      differences.push(
        `Health changed from ${previousSnapshot.health} to ${currentState.botHealth}`
      );
    }
    if (currentState.botHunger !== previousSnapshot.hunger) {
      differences.push(
        `Hunger changed from ${previousSnapshot.hunger} to ${currentState.botHunger}`
      );
    }

    // Check mob changes
    const newMobs = currentState.visibleMobs?.Mobs ?? [];
    const mobDifferences = this._calculateMobDifferences(
      previousSnapshot.visibleMobs,
      newMobs
    );
    differences.push(...mobDifferences);

    // Update the snapshot for the next call *after* calculating differences
    this.lastDiffStateSnapshot = this._createStateSnapshot(currentState);

    if (differences.length === 0) {
      return 'No notable changes since last state diff.';
    }

    return `State Diff: < ${differences.join(' | ')} >`;
  }

  /**
   * Main loop to interact with OpenAI, handle tool calls, and manage conversation flow.
   * FORCED LOOP: This version runs until the loopLimit is reached, unless an API error occurs.
   */
  public async callOpenAIWithTools(
    initialMessages: ChatCompletionMessageParam[]
  ): Promise<string> {
    const loopLimit = 100; // Or your desired fixed number of iterations
    let loopCount = 0;
    let lastAssistantText: string | null = null; // Track the last text response
    let finalResponse = `Processing completed after ${loopLimit} iterations.`; // Default final response

    // Use a mutable array for messages within the loop
    const currentMessages: ChatCompletionMessageParam[] = [...initialMessages];

    // Log initial messages only once, filtering roles
    initialMessages.forEach((msg) => {
      if (
        msg.role &&
        LOGGABLE_ROLES.has(msg.role as LoggableRole) &&
        msg.content
      ) {
        this.sharedState.logMessage(
          msg.role as LoggableRole,
          msg.content as string
        );
      } else if (msg.role && msg.content) {
        console.warn(
          `[FunctionCaller] Skipping logging for initial message with unloggable role: ${msg.role}`
        );
      }
    });

    while (loopCount < loopLimit) {
      loopCount++;
      console.log(
        `[FunctionCaller] Starting loop iteration ${loopCount}/${loopLimit}`
      );

      // Prepare messages for this iteration (attack check, chat injection, state diff)
      const messagesForApiCall =
        this._prepareMessagesForApiCall(currentMessages);

      // Make the API call
      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await this._makeApiCall(messagesForApiCall);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // Critical error, stop the loop
        finalResponse = `Error during API call on iteration ${loopCount}: ${errorMessage}`;
        this.sharedState.logMessage('system', finalResponse, { error: true });
        console.error(
          `[FunctionCaller] API Error on iteration ${loopCount}, terminating loop.`
        );
        break;
      }

      const choice = completion.choices[0];
      if (!choice?.message) {
        // No message received, critical error, stop the loop
        finalResponse = `No message received from API on iteration ${loopCount}.`;
        this.sharedState.logMessage('system', finalResponse, { error: true });
        console.error(
          `[FunctionCaller] No message from API on iteration ${loopCount}, terminating loop.`
        );
        break;
      }

      const responseMessage = choice.message;

      // Add assistant's response (text and/or tool calls) to the history
      currentMessages.push(responseMessage);

      // Log and store the assistant's text response if present
      if (responseMessage.content) {
        lastAssistantText = responseMessage.content; // Update last known text response
        if (LOGGABLE_ROLES.has('assistant')) {
          this.sharedState.logMessage('assistant', responseMessage.content, {
            note: `Assistant text response (loop ${loopCount})`,
          });
        }
      }

      // --- MODIFICATION START ---
      // We no longer break the loop here just because there are no tool calls.
      // The loop continues regardless of whether tools were called or not.
      // --- MODIFICATION END ---

      // Process tool calls if present
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log(
          `[FunctionCaller] Iteration ${loopCount}: Processing ${responseMessage.tool_calls.length} tool call(s).`
        );
        let allToolsProcessedSuccessfully = true;
        for (const toolCall of responseMessage.tool_calls) {
          const success = await this._processToolCall(
            toolCall,
            currentMessages
          );
          if (!success) {
            allToolsProcessedSuccessfully = false;
            console.warn(
              `[FunctionCaller] Iteration ${loopCount}: Tool call ${toolCall.function.name} failed.`
            );
            // Decide if you want to keep processing other tools in the same response
            // or potentially stop processing tools for this iteration
          }
        }
        if (!allToolsProcessedSuccessfully) {
          console.warn(
            `[FunctionCaller] Iteration ${loopCount}: One or more tool calls failed.`
          );
          // Loop continues, LLM will see the error results in the next iteration
        }
      } else {
        console.log(
          `[FunctionCaller] Iteration ${loopCount}: No tool calls received.`
        );
      }

      // Check if loop limit is reached (this will now be the primary exit condition)
      if (loopCount >= loopLimit) {
        console.log(`[FunctionCaller] Loop limit (${loopLimit}) reached.`);
        // Set the final response based on the last text received
        if (lastAssistantText !== null) {
          finalResponse = lastAssistantText;
          this.sharedState.logMessage('assistant', finalResponse, {
            note: 'Final response after hitting loop limit (last text received).',
          });
        } else {
          finalResponse = `Processing complete after ${loopLimit} iterations, but no text response was received from the assistant.`;
          this.sharedState.logMessage('system', finalResponse, {
            note: 'Loop limit hit without assistant text.',
          });
        }
        // No break needed here, the while condition will handle termination
      }
    } // End while loop

    await this._saveConversationLog();
    console.log(
      `[FunctionCaller] Exiting main loop. Final Determined Response: "${finalResponse}"`
    );
    return finalResponse;
  }

  // --- Private Helper Methods ---

  /** Builds the map of function names to their implementations. */
  private _buildActionRegistry(): ActionRegistry {
    const registry: ActionRegistry = new Map();
    const {
      miningService,
      craftingService,
      buildingService,
      combatService,
      smeltingService,
      farmingService,
      inventoryService,
      movementService,
      talkService,
    } = this.actionService;

    // --- Register Actions ---
    // Note: Using .bind() is crucial to maintain the 'this' context of the service methods.
    registry.set('mine', async (args) => {
      await miningService.mine(args.goalBlock, args.desiredCount);
      return `Mining operation for ${args.desiredCount} ${args.goalBlock} initiated successfully.`;
    });
    registry.set('craft', async (args) => {
      await craftingService.craft(args.goalItem);
      return `Crafting ${args.goalItem} initiated successfully.`;
    });
    registry.set('place', async (args) => {
      await buildingService.placeBlock(args.blockType);
      return `Placement of ${args.blockType} initiated successfully.`;
    });
    registry.set('placeChest', async (args) => {
      await buildingService.placeChest();
      return 'Chest placement initiated successfully.';
    });
    registry.set('placeFurnace', async (args) => {
      await buildingService.placeFurnace();
      return 'Furnace placement initiated successfully.';
    });
    registry.set('attack', async (args) => {
      await combatService.attack(args.mobType);
      return `Attack on nearest ${args.mobType} initiated successfully.`;
    });
    registry.set('smelt', async (args) => {
      await smeltingService.smelt(args.inputItemName, args.quantity);
      return `Smelting ${args.quantity} of ${args.inputItemName} initiated successfully.`;
    });
    registry.set('plantCrop', async (args) => {
      await farmingService.plantCrop(args.cropName);
      return `Attempting to plant ${args.cropName}.`;
    });
    registry.set('harvestCrop', async (args) => {
      await farmingService.harvestCrop(args.cropName);
      return `Attempting to harvest mature ${args.cropName}.`;
    });
    registry.set('storeItemInChest', async (args) => {
      await inventoryService.storeItemInChest(args.itemName, args.count);
      return `Attempting to store ${args.count} ${args.itemName} in a chest.`;
    });
    registry.set('retrieveItemFromChest', async (args) => {
      await inventoryService.retrieveItemFromChest(args.itemName, args.count);
      return `Attempting to retrieve ${args.count} ${args.itemName} from a chest.`;
    });
    registry.set('chat', async (args) => {
      //const finalSpeech = await this.social.filterMessageForSpeech(args.speech);
      talkService.chat(args.speech);
      return `Chat message sent: "${args.speech}"`;
    });
    registry.set('gotoPlayer', async (args) => {
      await movementService.gotoPlayer(args.playerName);
      return `Navigation to player ${args.playerName} initiated successfully.`;
    });
    registry.set('gotoCoordinates', async (args) => {
      const { x, y, z } = args.coordinates;
      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof z !== 'number'
      ) {
        throw new Error(
          `Invalid coordinates provided: ${JSON.stringify(args.coordinates)}`
        );
      }
      await movementService.gotoCoordinates({ x, y, z });
      return `Navigation to coordinates (${x.toFixed(1)}, ${y.toFixed(
        1
      )}, ${z.toFixed(1)}) initiated successfully.`;
    });
    // --- Add other actions here ---

    return registry;
  }

  /** Creates a snapshot of the relevant parts of the shared state. */
  private _createStateSnapshot(state: SharedAgentState): {
    health: number;
    hunger: number;
    visibleMobs: { name: string; distance: number }[];
  } {
    return {
      health: state.botHealth,
      hunger: state.botHunger,
      visibleMobs: state.visibleMobs ? [...state.visibleMobs.Mobs] : [],
    };
  }

  /** Compares old and new mob lists and returns textual descriptions of changes. */
  private _calculateMobDifferences(
    oldMobs: { name: string; distance: number }[],
    newMobs: { name: string; distance: number }[]
  ): string[] {
    const differences: string[] = [];
    const oldMobMap = new Map(
      oldMobs.map((m) => [m.name + '_' + m.distance.toFixed(1), m])
    ); // Use name+dist as key for uniqueness
    const newMobMap = new Map(
      newMobs.map((m) => [m.name + '_' + m.distance.toFixed(1), m])
    );

    // Mobs no longer visible
    for (const [key, oldMob] of oldMobMap) {
      if (!newMobMap.has(key)) {
        // More robust check: is the *same kind* of mob still visible nearby?
        const stillVisibleNearby = newMobs.some(
          (newMob) =>
            newMob.name === oldMob.name && newMob.distance < oldMob.distance + 5
        );
        if (!stillVisibleNearby) {
          differences.push(`Mob "${oldMob.name}" may no longer be visible`);
        }
      }
    }

    // New mobs or mobs with significant distance change
    for (const [key, newMob] of newMobMap) {
      if (!oldMobMap.has(key)) {
        // Check if it's truly new or just moved slightly
        const existedSimilarBefore = oldMobs.some(
          (oldMob) =>
            oldMob.name === newMob.name &&
            Math.abs(oldMob.distance - newMob.distance) < 1.0
        );
        if (!existedSimilarBefore) {
          differences.push(
            `New mob visible: "${newMob.name}" at ~${newMob.distance.toFixed(
              1
            )}m`
          );
        }
      } else {
        // Mob existed, check distance change (logic simplified, threshold check removed for clarity)
        const oldMob = oldMobMap.get(key)!; // Exists due to map logic
        const distChange = Math.abs(newMob.distance - oldMob.distance);
        if (distChange > 1.0) {
          // Only report changes > 1m
          differences.push(
            `Mob "${
              newMob.name
            }" distance changed from ${oldMob.distance.toFixed(
              1
            )}m to ${newMob.distance.toFixed(1)}m`
          );
        }
      }
    }
    return differences;
  }

  /** Checks for attacks, injects recent chats, and returns messages for API call. */
  private _prepareMessagesForApiCall(
    currentMessages: ChatCompletionMessageParam[]
  ): ChatCompletionMessageParam[] {
    const preparedMessages = [...currentMessages];

    // 1. Attack Check
    const {
      isUnderAttack,
      attacker,
      message: attackMsg,
    } = this.observer.checkIfUnderAttack();
    if (isUnderAttack) {
      const attackerName = attacker?.name ?? 'unknown entity';
      const systemAlert = `[DANGER ALERT] You are under attack by "${attackerName}". Observation: ${attackMsg}. Prioritize safety or defense!`;
      console.warn('Attack check:', systemAlert);
      preparedMessages.push({ role: 'user', content: systemAlert }); // Use 'user' role to force attention
      this.sharedState.logMessage('system', systemAlert, { alert: 'attack' });
    }

    // 2. Inject Recent Chats
    const recentChatMessages = this.observer.getAndClearRecentChats();
    if (recentChatMessages.length > 0) {
      const chatContextString = recentChatMessages.join('\n');
      const chatContextMessage: ChatCompletionMessageParam = {
        role: 'user', // Use 'user' role for observed chat
        content: `Recent Chat History Observed: [\n${chatContextString}\n]`,
      };
      preparedMessages.push(chatContextMessage);
      this.sharedState.logMessage(
        'system',
        `Injecting ${recentChatMessages.length} recent chat message(s) for LLM context.`,
        { history_length: recentChatMessages.length }
      );
    }

    // 3. Inject State Diff
    const stateDiff = this.getSharedStateDiffAsText();
    if (
      !stateDiff.startsWith('No notable changes') &&
      !stateDiff.startsWith('State diff unavailable')
    ) {
      // Only add if there are changes and it's not the first call
      preparedMessages.push({
        role: 'user', // Use 'user' role for observed state changes
        content: `--- State Update ---\n${stateDiff}\n--- End State Update ---`,
      });
      this.sharedState.logMessage(
        'system',
        'Injecting state differences for LLM context.',
        { diff: stateDiff }
      );
    }

    return preparedMessages;
  }

  /** Makes the API call to OpenAI and handles basic logging. */
  private async _makeApiCall(
    messagesToCall: ChatCompletionMessageParam[]
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    this.sharedState.logOpenAIRequest('chat.completions.create', {
      model: 'gpt-4o-mini',
      messages: messagesToCall,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false, // Explicitly false based on original code
    });

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Consider making model configurable
        messages: messagesToCall,
        tools,
        tool_choice: 'auto',
        parallel_tool_calls: false,
      });
      this.sharedState.logOpenAIResponse('chat.completions.create', completion);
      return completion;
    } catch (error) {
      console.error('[FunctionCaller] OpenAI API call failed:', error);
      this.sharedState.logOpenAIError('chat.completions.create', error);
      // Re-throw the error to be handled by the caller
      throw error;
    }
  }

  /**
   * Processes a single tool call requested by the LLM.
   * Uses the action registry to find and execute the corresponding function.
   * Logs results and updates the message history.
   * Returns true if successful, false otherwise.
   */
  private async _processToolCall(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    currentMessages: ChatCompletionMessageParam[] // Pass mutable history
  ): Promise<boolean> {
    const fnName = toolCall.function.name;
    const argsStr = toolCall.function.arguments;
    let toolCallResult = '';
    let parsedArgs: any;
    let success = true;

    // 1. Parse Arguments
    try {
      parsedArgs = JSON.parse(argsStr);
    } catch (err) {
      console.error(
        `[FunctionCaller] Failed to parse args for ${fnName}: ${argsStr}`,
        err
      );
      toolCallResult = `ERROR: Invalid JSON arguments provided. Input: ${argsStr}. Error: ${
        err instanceof Error ? err.message : String(err)
      }`;
      success = false;
      // Log parse error immediately
      this.sharedState.logMessage(
        'function',
        `Arg Parse Error: ${fnName}`,
        {
          tool_call_id: toolCall.id,
          raw_arguments: argsStr,
          error: toolCallResult,
        },
        fnName,
        argsStr, // Log raw args
        toolCallResult
      );
      // Add error result to history and return
      // FIX 2 & 3: Remove the 'name' property here
      const toolMessage: ChatCompletionToolMessageParam = {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: toolCallResult,
        // name: fnName, // REMOVED: 'name' is not a valid property here
      };
      currentMessages.push(toolMessage);
      return false;
    }

    // 2. Find and Execute Action from Registry
    const actionFunc = this.actionRegistry.get(fnName);

    if (!actionFunc) {
      console.warn(
        `[FunctionCaller] Unrecognized function call requested: ${fnName}`
      );
      toolCallResult = `ERROR: Function "${fnName}" is not implemented or recognized.`;
      success = false;
    } else {
      try {
        console.log(
          `[FunctionCaller] Executing tool: ${fnName} with args:`,
          parsedArgs
        );
        // Await the action function, which should return the result string
        toolCallResult = await actionFunc(parsedArgs);
        console.log(
          `[FunctionCaller] Tool ${fnName} executed. Result: ${toolCallResult}`
        );
      } catch (err) {
        console.error(
          `[FunctionCaller] Error executing ${fnName}(${argsStr}):`,
          err
        );
        toolCallResult = `ERROR executing function "${fnName}": ${
          err instanceof Error ? err.message : String(err)
        }`;
        success = false;

        // Special handling for craft errors (optional, as before)
        if (fnName === 'craft' && toolCallResult.includes('ingredient')) {
          try {
            const itemName = parsedArgs.goalItem;
            const itemInfo =
              minecraftItems[itemName as keyof typeof minecraftItems] ||
              minecraftBlocks[itemName as keyof typeof minecraftBlocks];
            if (itemInfo) {
              toolCallResult += ` How to get ingredients: "${itemInfo}"`;
            }
          } catch (lookupErr) {
            /* ignore */
          }
        }
      }
    }

    // 3. Log Execution Result
    this.sharedState.logMessage(
      'function', // Use 'function' role for logging tool execution
      success ? `Executed: ${fnName}` : `Execution Error: ${fnName}`,
      { tool_call_id: toolCall.id }, // Link log to the specific tool call
      fnName,
      parsedArgs, // Log parsed args
      toolCallResult
    );

    // 4. Add Tool Result to Message History
    // FIX 2 & 3: Remove the 'name' property here as well
    const toolResultMessage: ChatCompletionToolMessageParam = {
      tool_call_id: toolCall.id,
      role: 'tool',
      content: toolCallResult,
      // name: fnName, // REMOVED: 'name' is not a valid property here
    };
    currentMessages.push(toolResultMessage);

    // 5. Log State After Action (optional but useful)
    try {
      const updatedStateText = this.getSharedStateAsText(); // Use simplified state text
      // Ensure role 'system' is loggable
      if (LOGGABLE_ROLES.has('system')) {
        this.sharedState.logMessage('system', `State after ${fnName}`, {
          stateSnapshot:
            updatedStateText.substring(0, 500) +
            (updatedStateText.length > 500 ? '...' : ''), // Log truncated state
        });
      }
    } catch (stateErr) {
      console.error(
        '[FunctionCaller] Error getting state after action:',
        stateErr
      );
    }

    return success;
  }

  /** Saves the current conversation log to a timestamped file. */
  private async _saveConversationLog(): Promise<void> {
    try {
      const logDir = path.resolve(__dirname, '../../../logs'); // Adjust path relative to dist/src/functions
      await fs.mkdir(logDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const botUsername = this.sharedState.botUsername;
      const filename = `${botUsername}_conversation_${timestamp}.json`;
      const filePath = path.join(logDir, filename);

      const logData = this.sharedState.conversationLog;
      const jsonLogData = JSON.stringify(logData, null, 2);

      await fs.writeFile(filePath, jsonLogData, 'utf8');
      console.log(`[FunctionCaller] Conversation log saved to: ${filePath}`);
    } catch (error) {
      console.error(
        '[FunctionCaller] Failed to write conversation log:',
        error
      );
    }
  }
}
