// src/functions/functionCalling.ts
/*****************************************************
 * src/integratedFunctionCaller.ts
 *****************************************************/
import { Actions } from "../actions";
import { SharedAgentState } from "../sharedAgentState";
import { OpenAI } from "openai";
import { tools } from "./tools";
import { minecraftItems, minecraftBlocks } from "../../data/minecraftItems";

/**
 * FunctionCaller:
 * The central class for interacting with the OpenAI function-calling model,
 * capturing and logging all user messages, assistant responses, tool/function calls,
 * and final outputs. Also logs updated shared state information.
 */
export class FunctionCaller {
  private lastDiffStateSnapshot: {
    health: number;
    hunger: number;
    visibleMobs: { name: string; distance: number }[];
  } | null = null;

  constructor(
    private actions: Actions,
    private sharedState: SharedAgentState,
    private openai: OpenAI
  ) {}

  /**
   * Formats the shared state for a textual summary.
   */
  public getSharedStateAsText(): string {
    return this.sharedState.getSharedStateAsText();
  }

  /**
   * Returns a summary of differences in state since the last tick.
   */
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
        differences.push(`Mob \"${oldMob.name}\" no longer visible`);
      }
    }
    for (const newMob of newMobs) {
      if (!oldNames.includes(newMob.name)) {
        differences.push(
          `New mob visible: \"${newMob.name}\" at ~${newMob.distance}m`
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
            `Mob \"${oldMob.name}\" distance changed from ${oldDist.toFixed(
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

  /**
   * callOpenAIWithTools:
   * Sends user messages + context to the LLM, logs the conversation,
   * handles function calls, logs tool-call results, and returns final text.
   */
  public async callOpenAIWithTools(
    messages: Array<{ role: "user"; content: string }>
  ): Promise<string> {
    const loopLimit = 5;
    let finalResponse = "";

    // 1. Log the initial user messages
    for (const msg of messages) {
      this.sharedState.logMessage("user", msg.content);
    }

    // 2. Repeatedly call the model until it produces a final output or hits loopLimit
    let allMessages = [...messages];

    for (let loopCount = 0; loopCount < loopLimit; loopCount++) {
      // Send request
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: allMessages,
        tools: tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        store: true
      });

      const choice = completion.choices[0];
      const msg = choice.message;

      // 3. Log the assistant's response content (if any)
      if (msg.content) {
        this.sharedState.logMessage("assistant", msg.content);
      }

      // 4. Check for function calls
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // No function calls => final user-facing response
        finalResponse = msg.content ?? "";
        break;
      }

      // 5. If there are tool calls, handle each one in sequence
      for (const toolCall of msg.tool_calls) {
        const fnName = toolCall.function.name;
        const argsStr = toolCall.function.arguments; // JSON string
        let toolCallResult = "";

        // Attempt to parse arguments and run the corresponding action
        let parsedArgs: any;
        try {
          parsedArgs = JSON.parse(argsStr);
        } catch (err) {
          toolCallResult = `ERROR: Could not parse function arguments as JSON. Raw args = ${argsStr}`;
          this.sharedState.logMessage(
            "function",
            `Function call parse error for "${fnName}"`,
            {
              rawArguments: argsStr,
              error: String(err)
            }
          );
          // Provide a partial function message so the model can continue or correct
          const partialErrorContent = `Function call parse error for "${fnName}": ${toolCallResult}`;
          allMessages.push({
            role: "function",
            name: fnName,
            content: partialErrorContent
          } as any);
          continue;
        }

        // Actually call the function
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
            default:
              toolCallResult = `Function "${fnName}" not implemented.`;
              break;
          }
        } catch (err) {
          console.error("Error calling function:", fnName, err);
          toolCallResult = `ERROR calling function "${fnName}": ${String(err)}`;

          // If it's a craft error about missing ingredients, attach acquisition info
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
              // Do nothing if we fail to parse more info
            }
          }
        }

        // 6. Log the tool call (function call) with arguments + result
        this.sharedState.logMessage("function", `Tool call: ${fnName}`, {
          arguments: parsedArgs,
          result: toolCallResult
        });

        // 7. Provide an updated shared state snippet so the model can continue
        const updatedStateText = this.getSharedStateAsText();
        const combinedContent = `Updated Shared State:\n${updatedStateText}\n\nTool Call Result:\n${toolCallResult}`;

        // Also log the updated shared state for debugging
        this.sharedState.logMessage("function", "Updated Shared State", {
          updatedState: updatedStateText
        });

        // Finally push a new 'function' message for the model to see
        allMessages.push({
          role: "function",
          name: fnName,
          content: combinedContent
        } as any);
      }
    }

    // 8. If we never returned a finalResponse, set a default
    if (!finalResponse) {
      finalResponse = "No final response from model after function calls.";
    }

    // 9. Log the final response
    this.sharedState.logMessage("assistant", finalResponse, {
      note: "Final consolidated assistant response."
    });

    return finalResponse;
  }
}