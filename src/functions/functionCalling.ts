// src/functions/functionCalling.ts
/*****************************************************
 * src/integratedFunctionCaller.ts
 *****************************************************/
import { Actions } from "../actions";
import { SharedAgentState } from "../sharedAgentState";
import { OpenAI } from "openai";
import { tools } from "./tools"

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
   * Formats the shared state into clearly delimited sections.
   * Only the 10 nearest mobs (sorted by distance) are included.
   */
  public getSharedStateAsText(): string {
    const st = this.sharedState;
    let text = "";

    // Health & Hunger Section
    text += "===== Bot Status =====\n";
    text += "--- Health & Hunger ---\n";
    text += `Health: ${st.botHealth}\nHunger: ${st.botHunger}\n`;
    text += "-----------------------\n\n";

    // Inventory Section
    text += "===== Inventory =====\n";
    const invSummary =
      st.inventory && st.inventory.length > 0 ? st.inventory.join(", ") : "(nothing)";
    text += `Inventory: ${invSummary}\n`;
    text += "-----------------------\n\n";

    // Mobs Section: only the 10 nearest mobs sorted by distance
    text += "===== Mobs (Nearest 10) =====\n";
    if (st.visibleMobs && st.visibleMobs.Mobs.length > 0) {
      const sortedMobs = st.visibleMobs.Mobs.slice().sort((a, b) => a.distance - b.distance);
      const top10 = sortedMobs.slice(0, 10);
      const mobSummary = top10.map(
        (m) => `${m.name} (~${m.distance.toFixed(1)}m away)`
      ).join(", ");
      text += `Mobs: ${mobSummary}\n`;
    } else {
      text += "Mobs: none\n";
    }
    text += "-----------------------\n\n";

    // Players Nearby Section
    text += "===== Players Nearby =====\n";
    if (st.playersNearby && st.playersNearby.length > 0) {
      text += `Players Nearby: ${st.playersNearby.join(", ")}\n`;
    } else {
      text += "Players Nearby: none\n";
    }
    text += "-----------------------\n\n";

    // Pending Actions Section (if any)
    if (st.pendingActions && st.pendingActions.length > 0) {
      text += "===== Pending Actions =====\n";
      text += `Pending Actions: ${st.pendingActions.join(" | ")}\n`;
      text += "-----------------------\n\n";
    }

    return text;
  }

  /**
   * Returns a summary of differences in state since the last tick.
   * Now formatted with section markers.
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
        differences.push(`Mob "${oldMob.name}" no longer visible`);
      }
    }
    for (const newMob of newMobs) {
      if (!oldNames.includes(newMob.name)) {
        differences.push(`New mob visible: "${newMob.name}" at ~${newMob.distance}m`);
      }
    }
    for (const oldMob of oldMobs) {
      const matchingNew = newMobs.find((m) => m.name === oldMob.name);
      if (matchingNew) {
        const oldDist = oldMob.distance;
        const newDist = matchingNew.distance;
        if (oldDist !== 0) {
          const diffRatio = Math.abs(newDist - oldDist) / oldDist;
          if (diffRatio >= 0.15) {
            differences.push(
              `Mob "${oldMob.name}" distance changed from ${oldDist.toFixed(1)}m to ${newDist.toFixed(1)}m`
            );
          }
        } else {
          if (Math.abs(newDist - oldDist) > 0.1) {
            differences.push(
              `Mob "${oldMob.name}" distance changed from ${oldDist.toFixed(1)}m to ${newDist.toFixed(1)}m`
            );
          }
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

    const result = [
      "===== State Diff =====",
      ...differences,
      "======================"
    ].join("\n");

    return result;
  }

  /**
   * callOpenAIWithTools
   */
  public async callOpenAIWithTools(
    messages: Array<{ role: "user"; content: string }>
  ): Promise<string> {
    const loopLimit = 5;
    let finalResponse = "";

    // Log the initial messages sent to the model.
    messages.forEach((m) => {
      this.sharedState.addToConversationLog(`${m.role.toUpperCase()}: ${m.content}`);
    });

    for (let loopCount = 0; loopCount < loopLimit; loopCount++) {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools: tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        store: true,
      });

      const choice = completion.choices[0];
      const msg = choice.message;

      // Log the assistant's response.
      if (msg.content) {
        this.sharedState.addToConversationLog(`ASSISTANT: ${msg.content}`);
      }

      // If the model doesn't call any functions, we have a final user-facing response
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalResponse = msg.content ?? "";
        break;
      }

      // Otherwise, handle each tool call:
      for (const toolCall of msg.tool_calls) {
        const fnName = toolCall.function.name;
        const argsStr = toolCall.function.arguments; // JSON string
        let toolCallResult = "";

        try {
          const parsedArgs = JSON.parse(argsStr);
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
            case "sortInventory": {
              await this.actions.sortInventory();
              toolCallResult = `Sorted inventory.`;
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
            case "get_shared_state": {
              toolCallResult = this.getSharedStateAsText();
              break;
            }
            case "get_shared_state_diff": {
              toolCallResult = this.getSharedStateDiffAsText();
              break;
            }
            default:
              toolCallResult = `Function "${fnName}" not implemented.`;
          }
        } catch (err) {
          console.error("Error calling function:", fnName, err);
          toolCallResult = `ERROR calling function "${fnName}": ${String(err)}`;
        }

        // Log the tool call and its result.
        this.sharedState.addToConversationLog(
          `TOOL CALL - ${fnName} with args: ${argsStr} -> Result: ${toolCallResult}`
        );

        // Then push a new 'function' or 'assistant' message to continue:
        messages.push({
          role: "function",
          name: fnName,
          content: toolCallResult,
        } as any);
      }
    }

    if (!finalResponse) {
      finalResponse = "No final response from model after function calls.";
    }
    // Log the final response.
    this.sharedState.addToConversationLog(`FINAL RESPONSE: ${finalResponse}`);
    return finalResponse;
  }
}