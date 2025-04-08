// src/functions/functionCalling.ts

import OpenAI from "openai";
import minecraftData from "minecraft-data"; // Import minecraft-data
import { Bot } from "mineflayer"; // Import Bot type
import { ActionServices } from "../../types/actionServices.types";
import { minecraftBlocks, minecraftItems } from "../../data/minecraftItems";
import { Observer } from "../observer/observer";
import { SharedAgentState } from "../sharedAgentState";
import { Memory } from "./memory/memory";
import { Social } from "./social/social";
import { tools } from "./tools"; // Assuming tools definition is up-to-date
import fs from "fs/promises";
import path from "path";

export class FunctionCaller {
  private lastDiffStateSnapshot: {
    health: number;
    hunger: number;
    visibleMobs: { name: string; distance: number }[];
  } | null = null;
  private readonly MOB_DISTANCE_CHANGE_THRESHOLD = 0.15;
  private mcData: any; // Add mcData instance variable

  // Update constructor to accept individual services, Bot, and mcData
  constructor(
    private bot: Bot, // Add Bot
    // private actions: Actions, // Remove old actions
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
  }

  // --- getSharedStateAsText and getSharedStateDiffAsText remain the same ---
  public getSharedStateAsText(): string {
    return this.sharedState.getSharedStateAsText();
  }

  public getSharedStateDiffAsText(): string {
    const currentState = this.sharedState;
    if (!this.lastDiffStateSnapshot) {
      this.lastDiffStateSnapshot = {
        health: currentState.botHealth,
        hunger: currentState.botHunger,
        visibleMobs: currentState.visibleMobs
          ? [...currentState.visibleMobs.Mobs]
          : [],
      };
      return "No previous snapshot to diff; capturing current state.";
    }

    const differences: string[] = [];
    const previousSnapshot = this.lastDiffStateSnapshot;

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

    const newMobs = currentState.visibleMobs
      ? [...currentState.visibleMobs.Mobs]
      : [];
    const mobDifferences = this._calculateMobDifferences(
      previousSnapshot.visibleMobs,
      newMobs
    );
    differences.push(...mobDifferences);

    // Update snapshot for the next diff
    this.lastDiffStateSnapshot = {
      health: currentState.botHealth,
      hunger: currentState.botHunger,
      visibleMobs: newMobs,
    };

    if (differences.length === 0) {
      return "No notable changes since last tick.";
    }

    return `State Diff: < ${differences.join(" | ")} >`;
  }

  private _calculateMobDifferences(
    oldMobs: { name: string; distance: number }[],
    newMobs: { name: string; distance: number }[]
  ): string[] {
    const differences: string[] = [];
    const oldMobMap = new Map(oldMobs.map((m) => [m.name, m]));
    const newMobMap = new Map(newMobs.map((m) => [m.name, m]));

    // Check for mobs that disappeared
    for (const [name, oldMob] of oldMobMap) {
      if (!newMobMap.has(name)) {
        differences.push(`Mob "${name}" no longer visible`);
      }
    }

    // Check for new mobs or significant distance changes
    for (const [name, newMob] of newMobMap) {
      const oldMob = oldMobMap.get(name);
      if (!oldMob) {
        // New mob appeared
        differences.push(
          `New mob visible: "${name}" at ~${newMob.distance.toFixed(1)}m`
        );
      } else {
        // Mob still present, check distance change
        const oldDist = oldMob.distance;
        const newDist = newMob.distance;
        const distChange = Math.abs(newDist - oldDist);

        // Check for significant relative change or crossing a threshold (e.g., 1 block)
        if (
          (oldDist > 0 &&
            distChange / oldDist >= this.MOB_DISTANCE_CHANGE_THRESHOLD) ||
          distChange > 1.0
        ) {
          differences.push(
            `Mob "${name}" distance changed from ${oldDist.toFixed(
              1
            )}m to ${newDist.toFixed(1)}m`
          );
        } else if (oldDist === 0 && newDist > 0) {
          // Handle case where mob was right next to bot
          differences.push(
            `Mob "${name}" distance changed from very close to ${newDist.toFixed(
              1
            )}m`
          );
        }
      }
    }
    return differences;
  }
  // --- End of diff logic ---

  public async callOpenAIWithTools(
    messages: Array<{ role: "user" | "system"; content: string }> // Adjusted role types slightly
  ): Promise<string> {
    const loopLimit = 20;
    let finalResponse = "";
    let allMessages: Array<any> = [...messages]; // Use 'any' for broader compatibility with OpenAI types

    // 1. Log initial user/system messages
    for (const msg of messages) {
      this.sharedState.logMessage(msg.role, msg.content);
    }

    for (let loopCount = 0; loopCount < loopLimit; loopCount++) {
      // --- Attack Check ---
      const {
        isUnderAttack,
        attacker,
        message: attackMsg,
      } = this.observer.checkIfUnderAttack();
      if (isUnderAttack) {
        const attackerName = attacker?.name ?? "unknown entity";
        const systemAlert = `[DANGER ALERT] You are under attack by "${attackerName}". ${attackMsg}`;
        console.warn("Attack detected:", systemAlert);
        // Insert with higher priority? For now, just append.
        allMessages.push({ role: "user", content: systemAlert });
        this.sharedState.logMessage("system", systemAlert, { alert: "attack" });
        // Potentially force an attack action or defensive maneuver here?
        // For now, let the LLM decide based on the alert.
      }

      // --- Inject Recent Chat ---
      const recentChatMessages = this.observer.getAndClearRecentChats();
      let messagesForThisApiCall = [...allMessages];
      if (recentChatMessages.length > 0) {
        const chatContextString = recentChatMessages.join("\n");
        const chatContextMessage = {
          role: "user", // Treat chat history as user input for context
          content: `--- Recent Chat History Observed ---\n${chatContextString}\n --- End Chat History ---`,
        };
        messagesForThisApiCall.push(chatContextMessage);
        this.sharedState.logMessage(
          "system",
          "Injecting recent chat history for LLM context.",
          { history_length: recentChatMessages.length }
        );
      }

      // --- API Call ---
      this.sharedState.logOpenAIRequest("chat.completions.create", {
        model: "gpt-4o", // Specify model
        messages: messagesForThisApiCall,
        tools,
        tool_choice: "auto",
        parallel_tool_calls: false, // Keep false for sequential processing
        // store: true, // Assuming 'store' isn't a standard OpenAI param? Remove if so.
      });

      let completion;
      try {
        completion = await this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: messagesForThisApiCall as any, // Cast needed due to broader type
          tools,
          tool_choice: "auto",
          parallel_tool_calls: false,
        });
      } catch (error) {
        console.error("OpenAI API call failed:", error);
        this.sharedState.logOpenAIError("chat.completions.create", error);
        finalResponse = `Error communicating with OpenAI: ${
          error instanceof Error ? error.message : String(error)
        }`;
        break; // Exit loop on API error
      }

      this.sharedState.logOpenAIResponse("chat.completions.create", completion);

      const choice = completion.choices[0];
      const responseMessage = choice.message;

      // Add assistant's response (text and tool calls) to the history for the next iteration
      if (responseMessage) {
        allMessages.push(responseMessage);
      }

      // --- Handle Text Response ---
      if (responseMessage?.content) {
        this.sharedState.logMessage("assistant", responseMessage.content, {
          note: "Assistant textual response",
        });
        // If *only* a text response is given (no tool calls), we are done.
        if (
          !responseMessage.tool_calls ||
          responseMessage.tool_calls.length === 0
        ) {
          finalResponse = responseMessage.content;
          console.log("Assistant provided text response, no tools called.");
          break; // Exit loop
        }
      }

      // --- Handle No Response ---
      if (
        !responseMessage?.tool_calls ||
        responseMessage.tool_calls.length === 0
      ) {
        // If there was also no text content, exit loop.
        if (!responseMessage?.content) {
          finalResponse =
            "Assistant did not provide content or request tool use."; // Provide a default message
          console.log("No text content and no tool calls from assistant.");
          this.sharedState.logMessage("system", finalResponse, {
            note: "Empty response",
          });
        } else {
          // This case should have been caught above, but as a fallback:
          finalResponse = responseMessage.content;
        }
        break; // Exit loop
      }

      // --- Process Tool Calls ---
      let processingErrorOccurred = false;
      for (const toolCall of responseMessage.tool_calls) {
        // _processToolCall now handles adding the result back to allMessages
        const success = await this._processToolCall(toolCall, allMessages);
        if (!success) {
          processingErrorOccurred = true;
          // If a tool fails, we might want the LLM to know and react.
          // Continue the loop to send the error back to the LLM.
        }
      }

      // Optional: Break immediately on tool error if preferred
      // if (processingErrorOccurred) {
      //     finalResponse = "An error occurred during tool execution.";
      //     this.sharedState.logMessage("system", finalResponse, { error: "Tool execution failed" });
      //     break;
      // }

      // --- Loop Limit Check ---
      if (loopCount === loopLimit - 1) {
        finalResponse =
          "Loop limit reached without a final textual response from the model.";
        this.sharedState.logMessage("system", finalResponse, {
          note: "Loop limit hit",
        });
        console.warn("[FunctionCaller] Loop limit reached.");
      }
    } // End of loop

    // Ensure finalResponse has a value if the loop ended without setting one explicitly
    if (!finalResponse && allMessages.length > 0) {
      const lastMessage = allMessages[allMessages.length - 1];
      if (lastMessage.role === "assistant" && lastMessage.content) {
        finalResponse = lastMessage.content;
      } else if (lastMessage.role === "tool") {
        finalResponse = `Finished processing tool call: ${lastMessage.name}.`; // Provide context
      } else {
        finalResponse = "Processing complete."; // Generic fallback
      }
    } else if (!finalResponse) {
      finalResponse = "No response generated.";
    }

    this.sharedState.logMessage("assistant", finalResponse, {
      note: "Final response after loop/tool execution.",
    });
    console.log(
      "FUNCTION CALLER LOOP HAS ENDED. Final Response:",
      finalResponse
    );

    // Save log after processing is complete
    await this._saveConversationLog();

    return finalResponse;
  }

  private async _processToolCall(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    allMessages: Array<any> // Pass allMessages to append the result
  ): Promise<boolean> {
    const fnName = toolCall.function.name;
    const argsStr = toolCall.function.arguments;
    let toolCallResult = "";
    let parsedArgs: any;
    let success = true; // Assume success initially
    // --- Argument Parsing ---
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
      // Add any other services you might need here
    } = this.actionService;

    try {
      parsedArgs = JSON.parse(argsStr);
    } catch (err) {
      console.error(`Failed to parse arguments for ${fnName}: ${argsStr}`, err);
      toolCallResult = `ERROR: Could not parse function arguments as JSON. Raw args: ${argsStr}. Error: ${String(
        err
      )}`;
      this.sharedState.logMessage(
        "function", // Log as function execution attempt
        `Argument parse error for "${fnName}"`,
        {
          rawArguments: argsStr,
          error: String(err),
          tool_call_id: toolCall.id,
        },
        fnName,
        argsStr // Log raw args
      );
      success = false;
      // Append error result to messages for LLM context
      allMessages.push({
        tool_call_id: toolCall.id,
        role: "tool",
        name: fnName,
        content: toolCallResult,
      });
      return success; // Return early as function cannot be called
    }

    // --- Function Execution ---
    try {
      console.log(`Attempting to call tool: ${fnName} with args:`, parsedArgs); // Log call attempt

      switch (fnName) {
        case "mine": {
          const { goalBlock, desiredCount } = parsedArgs;
          await miningService.mine(goalBlock, desiredCount); // Use MiningService
          toolCallResult = `Successfully mined ${desiredCount} of ${goalBlock}.`;
          break;
        }
        case "craft": {
          const { goalItem } = parsedArgs;
          await craftingService.craft(goalItem);
          toolCallResult = `Successfully crafted ${goalItem}`;
          break;
        }
        case "place": {
          const { blockType } = parsedArgs;
          await buildingService.placeBlock(blockType); // Use BuildingService
          toolCallResult = `Successfully placed ${blockType}.`;
          break;
        }
        case "placeChest": {
          await buildingService.placeChest(); // Use BuildingService
          toolCallResult = `Successfully placed a chest.`;
          break;
        }
        case "placeFurnace": {

          await buildingService.placeFurnace();
          toolCallResult = `Successfully placed a furnace.`;
          break;
        }
        case "attack": {
          const { mobType } = parsedArgs;
          await combatService.attack(mobType); // Use CombatService
          toolCallResult = `Successfully initiated attack on ${mobType}.`;
          break;
        }
        case "smelt": {
          const { inputItemName, quantity } = parsedArgs;
          await smeltingService.smelt(inputItemName, quantity); // Use SmeltingService
          toolCallResult = `Successfully initiated smelting for ${quantity} of ${inputItemName}.`;
          break;
        }
        case "plantCrop": {
          const { cropName } = parsedArgs;
          await farmingService.plantCrop(cropName); // Use FarmingService
          toolCallResult = `Successfully attempted to plant ${cropName}.`;
          break;
        }
        case "harvestCrop": {
          const { cropName } = parsedArgs; // Simpler harvest - just harvest one mature plant
          await farmingService.harvestCrop(cropName); // Use FarmingService
          toolCallResult = `Successfully harvested one mature ${cropName}.`;
          break;
        }
        case "storeItemInChest": {
          const { itemName, count } = parsedArgs;
          await inventoryService.storeItemInChest(itemName, count); // Use InventoryService
          toolCallResult = `Successfully attempted to store ${count} of ${itemName} in a nearby chest.`;
          break;
        }
        case "retrieveItemFromChest": {
          const { itemName, count } = parsedArgs;
          await inventoryService.retrieveItemFromChest(itemName, count); // Use InventoryService
          toolCallResult = `Successfully attempted to retrieve ${count} of ${itemName} from a nearby chest.`;
          break;
        }
        case "chat": {
          const { speech } = parsedArgs;
          const finalSpeech = await this.social.filterMessageForSpeech(speech); // Filter is in Social
          await talkService.chat(finalSpeech); // Use TalkService
          toolCallResult = `Sent chat message: "${finalSpeech}"`;
          break;
        }
        case "gotoPlayer": {
          const { playerName } = parsedArgs;
          await movementService.gotoPlayer(playerName); // Use MovementService
          toolCallResult = `Successfully navigated to player ${playerName}.`;
          break;
        }
        case "gotoCoordinates": {
          const { coordinates } = parsedArgs;
          if (
            coordinates &&
            typeof coordinates.x === "number" &&
            typeof coordinates.y === "number" &&
            typeof coordinates.z === "number"
          ) {
            await movementService.gotoCoordinates(coordinates); // Use MovementService
            const targetDesc = `coordinates (${coordinates.x.toFixed(
              1
            )}, ${coordinates.y.toFixed(1)}, ${coordinates.z.toFixed(1)})`;
            toolCallResult = `Successfully navigated to ${targetDesc}.`;
          } else {
            toolCallResult = `ERROR: Invalid coordinates provided. Expected {x: number, y: number, z: number}. Received: ${JSON.stringify(
              coordinates
            )}`;
            success = false;
          }
          break;
        }
        default:
          toolCallResult = `ERROR: Function "${fnName}" is not implemented or recognized.`;
          console.warn(`Unrecognized function call requested: ${fnName}`);
          success = false;
          break;
      }
    } catch (err) {
      // Catch errors from the service calls themselves
      console.error(
        `Error executing function ${fnName} with args ${argsStr}:`,
        err
      );
      toolCallResult = `ERROR executing function "${fnName}": ${String(err)}`;
      success = false;

      // Add specific error context if useful (like for crafting)
      if (fnName === "craft" && String(err).includes("ingredient")) {
        try {
          const itemName = parsedArgs.goalItem;
          const infoFromItems =
            minecraftItems[itemName as keyof typeof minecraftItems] || "";
          const infoFromBlocks =
            minecraftBlocks[itemName as keyof typeof minecraftBlocks] || "";
          const acquisitionInfo = infoFromItems || infoFromBlocks;
          if (acquisitionInfo) {
            toolCallResult += ` How to get ingredients: "${acquisitionInfo}"`;
          }
        } catch (lookupErr) {
          console.warn(
            "Could not retrieve acquisition info for failed craft:",
            lookupErr
          );
        }
      }
    }

    // --- Log Result and Append to Message History ---
    this.sharedState.logMessage(
      "function", // Log as function result
      success ? `Executed: ${fnName}` : `Execution Error: ${fnName}`,
      { tool_call_id: toolCall.id }, // Link to the request
      fnName,
      parsedArgs, // Log parsed args
      toolCallResult // Log the string result
    );

    allMessages.push({
      tool_call_id: toolCall.id,
      role: "tool",
      name: fnName,
      content: toolCallResult, // Send result back to LLM
    });

    // Log state *after* the action
    try {
      const updatedStateText = this.getSharedStateAsText(); // Consider if diff is better here
      this.sharedState.logMessage("system", `State after ${fnName}`, {
        stateSnapshot: updatedStateText,
      });
    } catch (stateErr) {
      console.error("Error getting state after action:", stateErr);
    }

    return success;
  }

  private async _saveConversationLog(): Promise<void> {
    try {
      // Ensure log directory exists relative to the compiled JS file location (dist/src/functions)
      const logDir = path.resolve(__dirname, "../../../logs"); // Adjust relative path
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const botUsername = this.sharedState.botUsername; // Assuming botUsername is available
      const filename = `${botUsername}_conversation_${timestamp}.json`;
      const filePath = path.join(logDir, filename);

      await fs.mkdir(logDir, { recursive: true }); // Ensure directory exists

      const logData = this.sharedState.conversationLog; // Get the log array
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
