import { OpenAI } from "openai";
import { minecraftBlocks, minecraftItems } from "../../data/minecraftItems";
import { Actions } from "../actions";
import { Observer } from "../observer/observer";
import { SharedAgentState } from "../sharedAgentState";
import { Memory } from "./memory/memory";
import { Social } from "./social/social";
import { tools } from "./tools";
import fs from "fs/promises"; // Use promises API for async operations
import path from "path";

export class FunctionCaller {
  private lastDiffStateSnapshot: {
    health: number;
    hunger: number;
    visibleMobs: { name: string; distance: number }[];
  } | null = null;

  constructor(
    private actions: Actions,
    private sharedState: SharedAgentState,
    private openai: OpenAI,
    private memory: Memory,
    private social: Social,
    private observer: Observer
  ) {}

  public getSharedStateAsText(): string {
    return this.sharedState.getSharedStateAsText();
  }

  public getSharedStateDiffAsText(): string {
    const st = this.sharedState;
    if (!this.lastDiffStateSnapshot) {
      this.lastDiffStateSnapshot = {
        health: st.botHealth,
        hunger: st.botHunger,
        visibleMobs: st.visibleMobs ? [...st.visibleMobs.Mobs] : [],
      };
      return "No previous snapshot to diff; capturing current state.";
    }

    let differences: string[] = [];

    if (st.botHealth !== this.lastDiffStateSnapshot.health) {
      differences.push(
        `Health changed from ${this.lastDiffStateSnapshot.health} to ${st.botHealth}`
      );
    }
    if (st.botHunger !== this.lastDiffStateSnapshot.hunger) {
      differences.push(
        `Hunger changed from ${this.lastDiffStateSnapshot.hunger} to ${st.botHunger}`
      );
    }

    const oldMobs = this.lastDiffStateSnapshot.visibleMobs;
    const newMobs = st.visibleMobs ? [...st.visibleMobs.Mobs] : [];
    const oldNames = oldMobs.map((m) => m.name);
    const newNames = newMobs.map((m) => m.name);

    for (const oldMob of oldMobs) {
      if (!newNames.includes(oldMob.name)) {
        differences.push(`Mob "${oldMob.name}" no longer visible`);
      }
    }
    for (const newMob of newMobs) {
      if (!oldNames.includes(newMob.name)) {
        differences.push(
          `New mob visible: "${newMob.name}" at ~${newMob.distance}m`
        );
      }
    }
    for (const oldMob of oldMobs) {
      const matchingNew = newMobs.find((m) => m.name === oldMob.name);
      if (matchingNew) {
        const oldDist = oldMob.distance;
        const newDist = matchingNew.distance;
        if (oldDist !== 0 && Math.abs(newDist - oldDist) / oldDist >= 0.15) {
          differences.push(
            `Mob "${oldMob.name}" distance changed from ${oldDist.toFixed(
              1
            )}m to ${newDist.toFixed(1)}m`
          );
        }
      }
    }

    this.lastDiffStateSnapshot = {
      health: st.botHealth,
      hunger: st.botHunger,
      visibleMobs: newMobs,
    };

    if (differences.length === 0) {
      return "No notable changes since last tick.";
    }
    return `State Diff: < ${differences.join(" | ")} >`;
  }

  public async callOpenAIWithTools(
    messages: Array<{ role: "user"; content: string }>
  ): Promise<string> {
    const loopLimit = 20;
    let finalResponse = "";

    // 1. Log the initial user messages
    for (const msg of messages) {
      this.sharedState.logMessage("user", msg.content);
    }

    let allMessages = [...messages];

    for (let loopCount = 0; loopCount < loopLimit; loopCount++) {
      const {
        isUnderAttack,
        attacker,
        message: attackMsg,
      } = this.observer.checkIfUnderAttack();
      if (isUnderAttack) {
        const attackerName = attacker?.name ?? "unknown entity";
        const systemAlert = `[DANGER ALERT] You are under attack by "${attackerName}". ${attackMsg}`;
        console.log("under attack!");
        allMessages.push({ role: "user", content: systemAlert });
      }
      // --- NEW: Prepare messages for THIS API call, including recent chats ---
      let messagesForApiCall = [...allMessages]; // Copy current history

      const recentChatMessages = this.observer.getAndClearRecentChats();
      if (recentChatMessages.length > 0) {
        const chatContextString = recentChatMessages.join("\n");
        const chatContextMessage: { role: "user"; content: string } = {
          role: "user", // Representing observed chat as user input for context
          content: `--- Recent Chat History Observed ---\n${chatContextString}\n --- End Chat History ---`,
        };
        // Add context for this specific call
        messagesForApiCall.push(chatContextMessage);
        // Log that context was added (optional)
        this.sharedState.logMessage(
          "system",
          "Injecting recent chat history for LLM context.",
          { history_length: recentChatMessages.length }
        );
      }
      // --- END NEW ---
      // --- LOG REQUEST ---
      this.sharedState.logOpenAIRequest("chat.completions.create", {
        model: "gpt-4o",
        messages: allMessages,
        tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        store: true,
      });

      let completion;
      try {
        completion = await this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: allMessages,
          tools,
          tool_choice: "auto",
          parallel_tool_calls: false,
          store: true,
        });
      } catch (error) {
        // Log error
        this.sharedState.logOpenAIError("chat.completions.create", error);

        break;
      }

      // --- LOG RESPONSE ---
      this.sharedState.logOpenAIResponse("chat.completions.create", completion);

      const choice = completion.choices[0];
      const msg = choice.message;

      if (msg.content) {
        this.sharedState.logMessage("assistant", msg.content, {
          note: "Assistant textual response",
        });
      }

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalResponse = msg.content ?? "";
        console.log("No Message Content or No Tool Calls");
        break;
      }

      for (const toolCall of msg.tool_calls) {
        const fnName = toolCall.function.name;
        const argsStr = toolCall.function.arguments;
        let toolCallResult = "";

        // Attempt to parse arguments and run the corresponding action
        let parsedArgs: any;
        try {
          parsedArgs = JSON.parse(argsStr);
        } catch (err) {
          toolCallResult = `ERROR: Could not parse function arguments as JSON. Raw args = ${argsStr}`;
          // Pass functionName and raw arguments to logMessage
          this.sharedState.logMessage(
            "function", // Role
            `Function call parse error for "${fnName}"`, // Content
            { rawArguments: argsStr, error: String(err) }, // Metadata
            fnName, // functionName
            argsStr // functionArgs (raw string here)
          );
          const partialErrorContent = `Function call parse error for "${fnName}": ${toolCallResult}`;
          allMessages.push({
            role: "function",
            name: fnName,
            content: partialErrorContent,
          } as any);
          continue;
        }

        try {
          switch (fnName) {
            case "mine": {
              const { goalBlock, desiredCount } = parsedArgs;
              await this.actions.mine(goalBlock, desiredCount);
              toolCallResult = `Mined ${desiredCount} of ${goalBlock}.`;
              break;
            }
            case "craft": {
              const { goalItem } = parsedArgs;
              await this.actions.craft(goalItem);
              toolCallResult = `Crafted ${goalItem}.`;
              break;
            }
            case "place": {
              const { blockType } = parsedArgs;
              await this.actions.place(blockType);
              toolCallResult = `Placed ${blockType}.`;
              break;
            }
            case "attack": {
              const { mobType } = parsedArgs;
              await this.actions.attack(mobType);
              toolCallResult = `Attacked ${mobType}.`;
              break;
            }
            case "smelt": {
              const { inputItemName, quantity } = parsedArgs;
              await this.actions.smelt(inputItemName, quantity);
              toolCallResult = `Smelted ${quantity} of ${inputItemName}.`;
              break;
            }
            case "plantCrop": {
              const { cropName } = parsedArgs;
              await this.actions.plantCrop(cropName);
              toolCallResult = `Planted ${cropName}.`;
              break;
            }
            case "harvestCrop": {
              const { cropName, countOrAll } = parsedArgs;
              if (countOrAll === "all") {
                await this.actions.harvestCrop(cropName);
                toolCallResult = `Harvested all of ${cropName} (one pass).`;
              } else {
                const howMany = parseInt(countOrAll, 10);
                if (isNaN(howMany)) {
                  await this.actions.harvestCrop(cropName);
                  toolCallResult = `Harvested 1 of ${cropName} by default.`;
                } else {
                  for (let i = 0; i < howMany; i++) {
                    await this.actions.harvestCrop(cropName);
                  }
                  toolCallResult = `Harvested ${howMany} of ${cropName}.`;
                }
              }
              break;
            }
            case "placeChest": {
              await this.actions.placeChest();
              toolCallResult = `Placed chest.`;
              break;
            }
            case "storeItemInChest": {
              const { itemName, count } = parsedArgs;
              await this.actions.storeItemInChest(itemName, count);
              toolCallResult = `Stored ${count} of ${itemName} in chest.`;
              break;
            }
            case "retrieveItemFromChest": {
              const { itemName, count } = parsedArgs;
              await this.actions.retrieveItemFromChest(itemName, count);
              toolCallResult = `Retrieved ${count} of ${itemName} from chest.`;
              break;
            }
            case "chat": {
              const { speech } = parsedArgs;
              const finalSpeech = await this.social.filterMessageForSpeech(
                speech
              );
              await this.actions.chat(finalSpeech);
              toolCallResult = `Chatted: ${finalSpeech}`;
              break;
            }
            case "gotoPlayer": {
              const { playerName } = parsedArgs; // Extract playerName
              await this.actions.gotoPlayer(playerName);
              toolCallResult = `Successfully navigated to player ${playerName}.`;
              break;
            }
            // ---> ADDED: gotoCoordinates case <---
            case "gotoCoordinates": {
              const { coordinates } = parsedArgs; // Extract coordinates object
              await this.actions.gotoCoordinates(coordinates);
              const targetDesc = `coordinates (${coordinates.x.toFixed(1)}, ${coordinates.y.toFixed(1)}, ${coordinates.z.toFixed(1)})`;
              toolCallResult = `Successfully navigated to ${targetDesc}.`;
              break;
            }

            default:
              toolCallResult = `Function "${fnName}" not implemented.`;
              break;
          }
        } catch (err) {
          console.error("Error calling function:", fnName, err);
          toolCallResult = `ERROR calling function "${fnName}": ${String(err)}`;
          if (
            fnName === "craft" &&
            String(err).includes("Don't have enough/correct ingredients")
          ) {
            try {
              const craftArgs = parsedArgs;
              const itemName = craftArgs.goalItem;
              const infoFromItems = minecraftItems[itemName] || "";
              const infoFromBlocks = minecraftBlocks[itemName] || "";
              const acquisitionInfo = infoFromItems || infoFromBlocks;
              if (acquisitionInfo) {
                toolCallResult += ` Acquisition info: "${acquisitionInfo}"`;
              }
            } catch (jsonErr) {
              // do nothing
            }
          }
        }

        // 6. Log the tool call (function call) with arguments + result
        this.sharedState.logMessage(
          "function",
          `Tool call executed: ${fnName}`, // More descriptive content
          undefined, // No extra metadata needed here unless desired
          fnName, // functionName
          parsedArgs, // functionArgs (parsed)
          toolCallResult // functionResult
        );

        const updatedStateText = this.getSharedStateAsText();
        const combinedContent = `Updated Shared State:${updatedStateText} - Tool Call Result:${toolCallResult}`;
        this.sharedState.logMessage("function", "Updated Shared State", {
          updatedState: updatedStateText,
        });

        allMessages.push({
          role: "function",
          name: fnName,
          content: combinedContent,
        } as any);
      }
    }

    if (!finalResponse) {
      finalResponse = "No final response from model after function calls.";
    }
    this.sharedState.logMessage("assistant", finalResponse, {
      note: "Unfiltered assistant response.",
    });

    console.log("FUNCTION CALLER LOOP HAS ENDED");

    try {
      const logDir = path.resolve(__dirname, "../../../logs"); // Create a 'logs' directory in the project root
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); // Filesystem-friendly timestamp
      // Attempt to get bot username from shared state if available, otherwise use generic name
      const botUsername = "agent"; // Assuming you add botUsername to SharedAgentState later, or fallback
      const filename = `${botUsername}_conversation_${timestamp}.json`;
      const filePath = path.join(logDir, filename);

      // Ensure the logs directory exists
      await fs.mkdir(logDir, { recursive: true });

      // Get the conversation log data
      const logData = this.sharedState.conversationLog;

      // Format the log data as a pretty-printed JSON string
      const jsonLogData = JSON.stringify(logData, null, 2); // null, 2 for pretty printing

      // Write the data to the file
      await fs.writeFile(filePath, jsonLogData, "utf8");
      console.log(`[FunctionCaller] Conversation log saved to: ${filePath}`);
    } catch (error) {
      console.error(
        `[FunctionCaller] Failed to write conversation log to file:`,
        error
      );
      // Don't re-throw, allow the function to return the finalResponse
    }

    return finalResponse;
  }
}
