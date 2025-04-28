import OpenAI from "openai";
import minecraftData from "minecraft-data"; // Already imported
import { Bot } from "mineflayer";
import { ActionServices } from "../../types/actionServices.types";
import { minecraftBlocks, minecraftItems } from "../../data/minecraftItems";
import { Observer } from "../observer/observer";
import { SharedAgentState } from "../sharedAgentState";
import { Memory } from "./memory/memory";
import { Social } from "./social/social";
import { tools } from "./tools";
import fs from "fs/promises";
import path from "path";
import {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { LogEntry } from "../../types/log.types";

// Define interfaces for tool arguments based on tools.ts
interface MineArgs {
  goalBlock: string;
  desiredCount: number;
}
interface GotoPlayerArgs {
  playerName: string;
}
interface GotoCoordinatesArgs {
  coordinates: { x: number; y: number; z: number };
}
interface CraftArgs {
  goalItem: string;
}
interface PlaceArgs {
  blockType: string;
}
interface AttackArgs {
  mobType: string;
}
interface SmeltArgs {
  inputItemName: string;
  quantity: number;
}
interface PlantCropArgs {
  cropName: string;
}
interface HarvestCropArgs {
  cropName: string;
}
interface StoreItemInChestArgs {
  itemName: string;
  count: number;
}
interface RetrieveItemFromChestArgs {
  itemName: string;
  count: number;
}
interface ChatArgs {
  speech: string;
}

// FIX: Use Record<string, unknown> or specific interfaces for args
type ActionFunction = (args: Record<string, unknown>) => Promise<string>;
type ActionRegistry = Map<string, ActionFunction>;

type LoggableRole = LogEntry["role"];
const LOGGABLE_ROLES = new Set<LoggableRole>([
  "user",
  "assistant",
  "system",
  "function",
  "api_request",
  "api_response",
  "api_error",
  "memory",
]);

export class FunctionCaller {
  private lastDiffStateSnapshot: {
    health: number;
    hunger: number;
    visibleMobs: { name: string; distance: number }[];
  } | null = null;
  private readonly MOB_DISTANCE_CHANGE_THRESHOLD = 0.15;
  // FIX: Apply the imported type
  private mcData: minecraftData.IndexedData;
  private actionRegistry: ActionRegistry;

  constructor(
    private bot: Bot,
    private sharedState: SharedAgentState,
    private openai: OpenAI,
    private memory: Memory,
    private social: Social,
    private observer: Observer,
    private actionService: ActionServices
  ) {
    if (!this.bot.version) {
      throw new Error(
        "[FunctionCaller] Bot version is not available to initialize minecraft-data."
      );
    }
    this.mcData = minecraftData(this.bot.version);
    if (!this.mcData) {
      throw new Error(
        `[FunctionCaller] Failed to load minecraft-data for version ${this.bot.version}.`
      );
    }

    this.actionRegistry = this._buildActionRegistry();
  }

  /**
   * Returns the current shared state of the agent as a formatted text string.
   */
  public getSharedStateAsText(): string {
    return this.sharedState.getSharedStateAsText();
  }

  /**
   * Calculates and returns a text summary of notable changes in the agent's state
   * since the last time this function was called. Captures the current state
   * for the next comparison.
   */
  public getSharedStateDiffAsText(): string {
    const currentState = this.sharedState;
    const previousSnapshot = this.lastDiffStateSnapshot;

    // If this is the first call, capture state and return placeholder
    if (!previousSnapshot) {
      this.lastDiffStateSnapshot = this._createStateSnapshot(currentState);
      return "State diff unavailable on first call; capturing current state.";
    }

    const differences: string[] = [];

    // Check for health and hunger changes
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

    // Check for mob changes
    const newMobs = currentState.visibleMobs?.Mobs ?? [];
    const mobDifferences = this._calculateMobDifferences(
      previousSnapshot.visibleMobs,
      newMobs
    );
    differences.push(...mobDifferences);

    // Update snapshot for next call
    this.lastDiffStateSnapshot = this._createStateSnapshot(currentState);

    if (differences.length === 0) {
      return "No notable changes since last state diff.";
    }

    return `State Diff: < ${differences.join(" | ")} >`;
  }

  /**
   * Manages interaction with the OpenAI API, handling tool calls and maintaining conversation history.
   * @param initialMessages - The starting messages for the conversation.
   * @returns The final text response from the assistant or an error message.
   */
  public async callOpenAIWithTools(
    initialMessages: ChatCompletionMessageParam[]
  ): Promise<string> {
    const loopLimit = 100; // Prevent infinite loops
    let loopCount = 0;
    let lastAssistantText: string | null = null;
    let finalResponse = `Processing completed after ${loopLimit} iterations.`; // Default response if loop limit hit early

    // Make a mutable copy of the messages
    const currentMessages: ChatCompletionMessageParam[] = [...initialMessages];

    // Log initial messages
    initialMessages.forEach((msg) => {
      if (
        msg.role &&
        LOGGABLE_ROLES.has(msg.role as LoggableRole) &&
        msg.content // Check if content exists and is loggable
      ) {
        // Ensure content is string before logging
        this.sharedState.logMessage(
          msg.role as LoggableRole,
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content)
        );
      } else if (msg.role && msg.content) {
        console.warn(
          `[FunctionCaller] Skipping logging for initial message with unloggable role or non-string content: ${msg.role}`
        );
      }
    });

    while (loopCount < loopLimit) {
      loopCount++;
      console.log(
        `[FunctionCaller] Starting loop iteration ${loopCount}/${loopLimit}`
      );

      // Prepare messages by injecting context (attack alerts, chats, state diffs)
      const messagesForApiCall =
        this._prepareMessagesForApiCall(currentMessages);

      // Make the API call
      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await this._makeApiCall(messagesForApiCall);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // Log and break on API error
        finalResponse = `Error during API call on iteration ${loopCount}: ${errorMessage}`;
        this.sharedState.logMessage("system", finalResponse, { error: true });
        console.error(
          `[FunctionCaller] API Error on iteration ${loopCount}, terminating loop.`
        );
        break;
      }

      const choice = completion.choices[0];
      if (!choice?.message) {
        // Log and break if no message is returned
        finalResponse = `No message received from API on iteration ${loopCount}.`;
        this.sharedState.logMessage("system", finalResponse, { error: true });
        console.error(
          `[FunctionCaller] No message from API on iteration ${loopCount}, terminating loop.`
        );
        break;
      }

      const responseMessage = choice.message;

      // Add the assistant's response (or tool calls) to the history
      currentMessages.push(responseMessage);

      // Log assistant's text response if present
      if (responseMessage.content) {
        lastAssistantText = responseMessage.content;
        if (LOGGABLE_ROLES.has("assistant")) {
          this.sharedState.logMessage("assistant", responseMessage.content, {
            note: `Assistant text response (loop ${loopCount})`,
          });
        }
      }

      // Check for tool calls
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log(
          `[FunctionCaller] Iteration ${loopCount}: Processing ${responseMessage.tool_calls.length} tool call(s).`
        );
        let allToolsProcessedSuccessfully = true;
        for (const toolCall of responseMessage.tool_calls) {
          // Process the tool call and add the result to currentMessages
          const success = await this._processToolCall(
            toolCall,
            currentMessages // Pass mutable message history
          );
          if (!success) {
            allToolsProcessedSuccessfully = false;
            console.warn(
              `[FunctionCaller] Iteration ${loopCount}: Tool call ${toolCall.function.name} failed.`
            );
            // Optional: Break loop on first tool failure? Or continue processing others?
            // Currently continues.
          }
        }
        if (!allToolsProcessedSuccessfully) {
          console.warn(
            `[FunctionCaller] Iteration ${loopCount}: One or more tool calls failed.`
          );
          // Optional: decide if loop should break here
        }
      } else {
        // No tool calls, means the assistant provided a final text response
        console.log(
          `[FunctionCaller] Iteration ${loopCount}: No tool calls received. Assuming final response.`
        );
        finalResponse =
          lastAssistantText ?? "Assistant did not provide a text response.";
        this.sharedState.logMessage("assistant", finalResponse, {
          note: "Final response (no tool calls).",
        });
        break; // Exit loop as we have the final answer
      }

      // Check if loop limit is reached
      if (loopCount >= loopLimit) {
        console.log(`[FunctionCaller] Loop limit (${loopLimit}) reached.`);
        // Use the last recorded text response, or a default message
        if (lastAssistantText !== null) {
          finalResponse = lastAssistantText;
          this.sharedState.logMessage("assistant", finalResponse, {
            note: "Final response after hitting loop limit (last text received).",
          });
        } else {
          finalResponse = `Processing complete after ${loopLimit} iterations, but no text response was received from the assistant.`;
          this.sharedState.logMessage("system", finalResponse, {
            note: "Loop limit hit without assistant text.",
          });
        }
        break; // Exit loop
      }
    } // End while loop

    await this._saveConversationLog();
    console.log(
      `[FunctionCaller] Exiting main loop. Final Determined Response: "${finalResponse}"`
    );
    return finalResponse;
  }

  /** Builds the registry mapping function names to their implementations. */
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

    // Helper to safely cast args with logging
    function safeCast<T>(args: Record<string, unknown>, funcName: string): T {
      // Basic validation could be added here if needed
      console.log(`[Registry ${funcName}] Casting args:`, args);
      return args as T;
    }

    // Registering actions with type casting
    registry.set("mine", async (args) => {
      const typedArgs = safeCast<MineArgs>(args, "mine");
      await miningService.mine(typedArgs.goalBlock, typedArgs.desiredCount);
      return `Mining operation for ${typedArgs.desiredCount} ${typedArgs.goalBlock} initiated successfully.`;
    });
    registry.set("craft", async (args) => {
      const typedArgs = safeCast<CraftArgs>(args, "craft");
      await craftingService.craft(typedArgs.goalItem);
      return `Crafting ${typedArgs.goalItem} initiated successfully.`;
    });
    registry.set("place", async (args) => {
      const typedArgs = safeCast<PlaceArgs>(args, "place");
      await buildingService.placeBlock(typedArgs.blockType);
      return `Placement of ${typedArgs.blockType} initiated successfully.`;
    });
    // FIX: Prefix unused args with _
    registry.set("placeChest", async () => {
      await buildingService.placeChest();
      return "Chest placement initiated successfully.";
    });
    // FIX: Prefix unused args with _
    registry.set("placeFurnace", async () => {
      await buildingService.placeFurnace();
      return "Furnace placement initiated successfully.";
    });
    registry.set("attack", async (args) => {
      const typedArgs = safeCast<AttackArgs>(args, "attack");
      combatService.attack(typedArgs.mobType);
      return `Attack on nearest ${typedArgs.mobType} initiated successfully.`;
    });
    registry.set("smelt", async (args) => {
      const typedArgs = safeCast<SmeltArgs>(args, "smelt");
      await smeltingService.smelt(typedArgs.inputItemName, typedArgs.quantity);
      return `Smelting ${typedArgs.quantity} of ${typedArgs.inputItemName} initiated successfully.`;
    });
    registry.set("plantCrop", async (args) => {
      const typedArgs = safeCast<PlantCropArgs>(args, "plantCrop");
      await farmingService.plantCrop(typedArgs.cropName);
      return `Attempting to plant ${typedArgs.cropName}.`;
    });
    registry.set("harvestCrop", async (args) => {
      const typedArgs = safeCast<HarvestCropArgs>(args, "harvestCrop");
      await farmingService.harvestCrop(typedArgs.cropName);
      return `Attempting to harvest mature ${typedArgs.cropName}.`;
    });
    registry.set("storeItemInChest", async (args) => {
      const typedArgs = safeCast<StoreItemInChestArgs>(
        args,
        "storeItemInChest"
      );
      await inventoryService.storeItemInChest(
        typedArgs.itemName,
        typedArgs.count
      );
      return `Attempting to store ${typedArgs.count} ${typedArgs.itemName} in a chest.`;
    });
    registry.set("retrieveItemFromChest", async (args) => {
      const typedArgs = safeCast<RetrieveItemFromChestArgs>(
        args,
        "retrieveItemFromChest"
      );
      await inventoryService.retrieveItemFromChest(
        typedArgs.itemName,
        typedArgs.count
      );
      return `Attempting to retrieve ${typedArgs.count} ${typedArgs.itemName} from a chest.`;
    });
    // FIX: Remove async as talkService.chat is sync
    registry.set("chat", (args) => {
      const typedArgs = safeCast<ChatArgs>(args, "chat");
      talkService.chat(typedArgs.speech);
      // Return a resolved promise for consistency with ActionFunction type
      return Promise.resolve(`Chat message sent: "${typedArgs.speech}"`);
    });
    registry.set("gotoPlayer", async (args) => {
      const typedArgs = safeCast<GotoPlayerArgs>(args, "gotoPlayer");
      await movementService.gotoPlayer(typedArgs.playerName);
      return `Navigation to player ${typedArgs.playerName} initiated successfully.`;
    });
    registry.set("gotoCoordinates", async (args) => {
      // FIX: Ensure args.coordinates exists and has correct properties before accessing x, y, z
      const typedArgs = safeCast<GotoCoordinatesArgs>(args, "gotoCoordinates");
      const { x, y, z } = typedArgs.coordinates;
      // Type checking already happened during JSON parsing and validation by OpenAI schema
      await movementService.gotoCoordinates({ x, y, z });
      return `Navigation to coordinates (${x.toFixed(1)}, ${y.toFixed(
        1
      )}, ${z.toFixed(1)}) initiated successfully.`;
    });
    // Add other action services here...

    return registry;
  }

  /** Creates a snapshot of the current agent state relevant for diffing. */
  private _createStateSnapshot(state: SharedAgentState): {
    health: number;
    hunger: number;
    visibleMobs: { name: string; distance: number }[];
  } {
    return {
      health: state.botHealth,
      hunger: state.botHunger,
      // Ensure visibleMobs and Mobs array exist before spreading
      visibleMobs: state.visibleMobs?.Mobs ? [...state.visibleMobs.Mobs] : [],
    };
  }

  /** Compares old and new mob lists to generate difference descriptions. */
  private _calculateMobDifferences(
    oldMobs: { name: string; distance: number }[],
    newMobs: { name: string; distance: number }[]
  ): string[] {
    const differences: string[] = [];
    // Use a more robust way to identify mobs if possible (e.g., entity ID if available)
    // For now, name + approximate distance is used as a key.


    // Check for disappeared mobs (loosely)
    for (const oldMob of oldMobs) {
      const stillVisibleNearby = newMobs.some(
        (newMob) =>
          newMob.name === oldMob.name &&
          Math.abs(newMob.distance - oldMob.distance) < 5 // Check if same mob type is still within 5 blocks distance change
      );
      if (!stillVisibleNearby) {
        differences.push(
          `Mob "${
            oldMob.name
          }" may no longer be nearby (was ~${oldMob.distance.toFixed(1)}m)`
        );
      }
    }

    // Check for new mobs or significant distance changes
    for (const newMob of newMobs) {
      const existedSimilarBefore = oldMobs.some(
        (oldMob) =>
          oldMob.name === newMob.name &&
          Math.abs(oldMob.distance - newMob.distance) < 1.0 // Threshold for "same" mob reappearing slightly moved
      );
      if (!existedSimilarBefore) {
        // Likely a new mob appearance
        differences.push(
          `New mob visible: "${newMob.name}" at ~${newMob.distance.toFixed(1)}m`
        );
      } else {
        // Check for significant distance change for mobs considered "the same"
        const oldVersion = oldMobs.find(
          (oldMob) =>
            oldMob.name === newMob.name &&
            Math.abs(oldMob.distance - newMob.distance) < 1.0
        );
        if (oldVersion) {
          const distChange = Math.abs(newMob.distance - oldVersion.distance);
          // Only report if distance changed significantly (e.g., > 2 blocks) but wasn't flagged as new/disappeared
          if (distChange > 2.0) {
            differences.push(
              `Mob "${
                newMob.name
              }" distance changed from ~${oldVersion.distance.toFixed(
                1
              )}m to ~${newMob.distance.toFixed(1)}m`
            );
          }
        }
      }
    }
    return differences;
  }

  /** Prepares the list of messages for the API call by injecting context. */
  private _prepareMessagesForApiCall(
    currentMessages: ChatCompletionMessageParam[]
  ): ChatCompletionMessageParam[] {
    const preparedMessages = [...currentMessages];

    // Inject Attack Alert
    const {
      isUnderAttack,
      attacker,
      message: attackMsg,
    } = this.observer.checkIfUnderAttack();
    if (isUnderAttack) {
      const attackerName = attacker?.name ?? "unknown entity";
      const systemAlert = `[DANGER ALERT] You are under attack by "${attackerName}". Observation: ${attackMsg}. Prioritize safety or defense!`;
      console.warn("Attack check:", systemAlert);
      preparedMessages.push({ role: "user", content: systemAlert }); // Inject as user message for direct attention
      this.sharedState.logMessage("system", systemAlert, { alert: "attack" });
    }

    // Inject Recent Chat History
    const recentChatMessages = this.observer.getAndClearRecentChats();
    if (recentChatMessages.length > 0) {
      const chatContextString = recentChatMessages.join("\n");
      const chatContextMessage: ChatCompletionMessageParam = {
        role: "user", // Inject as user message for context
        content: `Recent Chat History Observed: [\n${chatContextString}\n]`,
      };
      preparedMessages.push(chatContextMessage);
      this.sharedState.logMessage(
        "system",
        `Injecting ${recentChatMessages.length} recent chat message(s) for LLM context.`,
        { history_length: recentChatMessages.length }
      );
    }

    // Inject State Differences
    const stateDiff = this.getSharedStateDiffAsText();
    if (
      !stateDiff.startsWith("No notable changes") &&
      !stateDiff.startsWith("State diff unavailable")
    ) {
      // Inject state diff as user message for context
      preparedMessages.push({
        role: "user",
        content: `--- State Update ---\n${stateDiff}\n--- End State Update ---`,
      });
      this.sharedState.logMessage(
        "system",
        "Injecting state differences for LLM context.",
        { diff: stateDiff }
      );
    }

    return preparedMessages;
  }

  /** Makes the actual call to the OpenAI Chat Completions API. */
  private async _makeApiCall(
    messagesToCall: ChatCompletionMessageParam[]
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    // Log the request being sent
    this.sharedState.logOpenAIRequest("chat.completions.create", {
      model: "gpt-4o-mini", // Or your desired model
      messages: messagesToCall,
      tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
    });

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Or your desired model
        messages: messagesToCall,
        tools,
        tool_choice: "auto", // Let the model decide between text and function calls
        parallel_tool_calls: false, // Disable parallel calls for sequential processing
      });
      // Log the successful response
      this.sharedState.logOpenAIResponse("chat.completions.create", completion);
      return completion;
    } catch (error) {
      console.error("[FunctionCaller] OpenAI API call failed:", error);
      // Log the error
      this.sharedState.logOpenAIError("chat.completions.create", error);
      // Re-throw the error to be handled by the calling loop
      throw error;
    }
  }

  /**
   * Processes a single tool call received from the API.
   * Executes the corresponding function and adds the result to the message history.
   * @param toolCall - The tool call object from the API response.
   * @param currentMessages - The mutable list of messages in the current conversation.
   * @returns True if the tool call was processed successfully, false otherwise.
   */
  private async _processToolCall(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    currentMessages: ChatCompletionMessageParam[] // Modified to accept history
  ): Promise<boolean> {
    const fnName = toolCall.function.name;
    const argsStr = toolCall.function.arguments;
    let toolCallResult = "";
    // FIX: Type parsedArgs as unknown initially
    let parsedArgs: unknown;
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
        "function", // Log as function role
        `Arg Parse Error: ${fnName}`,
        {
          tool_call_id: toolCall.id,
          raw_arguments: argsStr,
          error: toolCallResult, // Include error details in metadata
        },
        fnName,
        argsStr, // Log raw args
        toolCallResult // Log result (which is the error message)
      );

      // Push the error result back into the message history for the LLM
      const toolMessage: ChatCompletionToolMessageParam = {
        tool_call_id: toolCall.id,
        role: "tool",
        content: toolCallResult, // Provide the error message as the tool's output
      };
      currentMessages.push(toolMessage);
      return false; // Indicate failure
    }

    // 2. Find and Execute Function
    const actionFunc = this.actionRegistry.get(fnName);

    if (!actionFunc) {
      console.warn(
        `[FunctionCaller] Unrecognized function call requested: ${fnName}`
      );
      toolCallResult = `ERROR: Function "${fnName}" is not implemented or recognized.`;
      success = false;
    } else {
      // 3. Execute the Action
      try {
        console.log(
          `[FunctionCaller] Executing tool: ${fnName} with args:`,
          parsedArgs // Log the parsed args object
        );
        // FIX: Ensure parsedArgs is treated as Record<string, unknown> for the function call
        if (typeof parsedArgs !== "object" || parsedArgs === null) {
          throw new Error("Parsed arguments are not a valid object.");
        }
        toolCallResult = await actionFunc(
          parsedArgs as Record<string, unknown>
        );
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

        // Add context for crafting failures
        if (fnName === "craft" && toolCallResult.includes("ingredient")) {
          try {
            // FIX: Safely access goalItem from parsedArgs
            const itemName = (parsedArgs as CraftArgs)?.goalItem;
            if (itemName && typeof itemName === "string") {
              const itemInfo =
                minecraftItems[itemName] ||
                minecraftBlocks[itemName];
              if (itemInfo) {
                toolCallResult += ` How to get ingredients: "${itemInfo}"`;
              }
            }
          } catch /* FIX: Remove unused variable */ {
            // Ignore error during ingredient lookup, just don't add the extra info
          }
        }
      }
    }

    // 4. Log the function call outcome
    this.sharedState.logMessage(
      "function", // Log as function role
      success ? `Executed: ${fnName}` : `Execution Error: ${fnName}`,
      { tool_call_id: toolCall.id }, // Metadata
      fnName,
      parsedArgs, // Arguments
      toolCallResult // Result
    );

    // 5. Add the result back to the message history for the LLM
    const toolResultMessage: ChatCompletionToolMessageParam = {
      tool_call_id: toolCall.id,
      role: "tool",
      content: toolCallResult, // Provide function result or error message
    };
    currentMessages.push(toolResultMessage);

    // Optional: Log state after action for debugging
    try {
      const updatedStateText = this.getSharedStateAsText();
      // Avoid logging excessively large states
      if (LOGGABLE_ROLES.has("system")) {
        this.sharedState.logMessage("system", `State after ${fnName}`, {
          stateSnapshot:
            updatedStateText.substring(0, 500) +
            (updatedStateText.length > 500 ? "..." : ""), // Log truncated state
        });
      }
    } catch (stateErr) {
      console.error(
        "[FunctionCaller] Error getting state after action:",
        stateErr
      );
    }

    return success;
  }

  /** Saves the current conversation log to a timestamped file. */
  private async _saveConversationLog(): Promise<void> {
    try {
      const logDir = path.resolve(__dirname, "../../../logs"); // Ensure path is correct relative to compiled JS file
      await fs.mkdir(logDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const botUsername = this.sharedState.botUsername;
      const filename = `${botUsername}_conversation_${timestamp}.json`;
      const filePath = path.join(logDir, filename);

      const logData = this.sharedState.conversationLog;
      const jsonLogData = JSON.stringify(logData, null, 2); // Pretty print JSON

      await fs.writeFile(filePath, jsonLogData, "utf8");
      console.log(`[FunctionCaller] Conversation log saved to: ${filePath}`);
    } catch (error) {
      console.error(
        "[FunctionCaller] Failed to write conversation log:",
        error
      );
    }
  }
}
