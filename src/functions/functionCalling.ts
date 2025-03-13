/*****************************************************
 * src/integratedFunctionCaller.ts
 *****************************************************/
import { Actions } from "../actions";
import { SharedAgentState } from "../sharedAgentState";
import { OpenAI } from "openai";
import {tools} from "./tools"

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

  public getSharedStateAsText(): string {
    const st = this.sharedState;
    const lines: string[] = [];
    lines.push(`Health: ${st.botHealth}`);
    lines.push(`Hunger: ${st.botHunger}`);
    const invSummary =
      st.inventory && st.inventory.length > 0
        ? st.inventory.join(", ")
        : "(nothing)";
    lines.push(`Inventory: ${invSummary}`);

    if (st.visibleMobs && st.visibleMobs.Mobs.length > 0) {
      const mobSummary = st.visibleMobs.Mobs.map(
        (m) => `${m.name} (~${m.distance.toFixed(1)}m away)`
      ).join(", ");
      lines.push(`Mobs: ${mobSummary}`);
    } else {
      lines.push("Mobs: none");
    }

    if (st.playersNearby && st.playersNearby.length > 0) {
      lines.push(`Players Nearby: ${st.playersNearby.join(", ")}`);
    } else {
      lines.push("Players Nearby: none");
    }

    if (st.pendingActions.length > 0) {
      lines.push(`Pending Actions: ${st.pendingActions.join(" | ")}`);
    }

    return lines.join("\n");
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

    if (differences.length === 0) {
      this.lastDiffStateSnapshot = {
        health: st.botHealth,
        hunger: st.botHunger,
        visibleMobs: newMobs,
      };
      return "No notable changes since last tick.";
    }

    const result = [
      "for clarity, these are the differences since last tick:",
      ...differences,
    ].join("\n");

    this.lastDiffStateSnapshot = {
      health: st.botHealth,
      hunger: st.botHunger,
      visibleMobs: newMobs,
    };

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
    return finalResponse;
  }
}