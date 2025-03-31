import { AgentBot } from "./createAgentBot";
import { handleTestGoal } from "./testGoal"; // Assuming handleTestGoal is separate or modify as needed

/**
 * Handles various "test" chat commands directed at a specific bot agent.
 *
 * @param agent The AgentBot instance (AgentBot or DaBiggestBird) to execute the command.
 * @param username The username of the player who sent the command.
 * @param commandMessage The test command message (e.g., "recipe stone", "mine coal 5").
 */
export async function handleChatTestCommand(
  agent: AgentBot,
  username: string,
  commandMessage: string
): Promise<void> {
  // Avoid self-execution if the bot somehow triggers its own command
  if (username === agent.bot.username) return;

  const { bot, observer, navigation, actions, functionCaller } = agent;
  const parts = commandMessage.split(" ");
  const command = parts[0]?.toLowerCase(); // Get the command (e.g., "recipe", "mine")

  // Log which bot is executing which command
  bot.chat(`[${bot.username}] Executing test command: ${commandMessage}`);

  try {
    switch (command) {
      case "recipe": {
        const itemName = parts.slice(1).join("_");
        if (!itemName) {
          bot.chat(`[${bot.username}] Usage: test recipe <itemName>`);
          return;
        }
        const recipeInfo = observer.getRecipeForItem(itemName);
        bot.chat(`[${bot.username}] ${recipeInfo}`);
        break;
      }
      case "craftable": {
        const itemName = parts.slice(1).join("_");
        if (!itemName) {
          bot.chat(`[${bot.username}] Usage: test craftable <itemName>`);
          return;
        }
        const canCraft = observer.canCraftItem(itemName);
        bot.chat(
          `[${bot.username}] ${
            canCraft
              ? `Yes, I can craft "${itemName}" immediately.`
              : `No, I cannot craft "${itemName}" immediately.`
          }`
        );
        break;
      }
      case "possible": {
        const itemName = parts.slice(1).join("_");
        if (!itemName) {
          bot.chat(`[${bot.username}] Usage: test possible <itemName>`);
          return;
        }
        const canEventually = observer.canEventuallyCraftItem(itemName);
        bot.chat(
          `[${bot.username}] ${
            canEventually
              ? `Yes, it is possible to craft "${itemName}" eventually.`
              : `No, it is not possible to craft "${itemName}".`
          }`
        );
        break;
      }
      case "mine": {
        const blockName = parts[1];
        const desiredCount = parseInt(parts[2] || "1", 10);
        if (!blockName || isNaN(desiredCount)) {
          bot.chat(`[${bot.username}] Usage: test mine <blockName> [count]`);
          return;
        }
        await actions.mine(blockName, desiredCount);
        bot.chat(`[${bot.username}] Finished mine task for ${blockName}.`);
        break;
      }
      case "craft": {
        const itemName = parts[1];
        if (!itemName) {
          bot.chat(`[${bot.username}] Usage: test craft <itemName>`);
          return;
        }
        await actions.craft(itemName);
        bot.chat(`[${bot.username}] Finished craft task for ${itemName}.`);
        break;
      }
      case "place": {
        const blockType = parts[1];
        if (!blockType) {
          bot.chat(`[${bot.username}] Usage: test place <blockType>`);
          return;
        }
        await actions.place(blockType);
        bot.chat(`[${bot.username}] Finished place task for ${blockType}.`);
        break;
      }
      case "attack": {
        const mobType = parts[1];
        if (!mobType) {
          bot.chat(`[${bot.username}] Usage: test attack <mobType>`);
          return;
        }
        await actions.attack(mobType);
        // Note: attack might not have a definitive end signal easily available
        bot.chat(`[${bot.username}] Initiated attack on ${mobType}.`);
        break;
      }
      case "allblocks": {
        const radius = parseInt(parts[1] || "10", 10);
        const blocks = await observer.getAllBlocksInRadius(radius);
        const blockList = blocks
          .map((b) => `${b.name}(${b.x},${b.y},${b.z})`)
          .join(", ");
        const output = `[${bot.username}] Detailed Blocks (${radius} radius): ${
          blockList || "None found"
        }`;
        bot.chat(output.substring(0, 250)); // Limit chat length
        console.log(`[${bot.username}] All blocks (${radius}): ${blockList}`);
        break;
      }
      case "usetable": {
        await actions.useCraftingTable();
        bot.chat(`[${bot.username}] Attempted to use crafting table.`);
        break;
      }
      case "inv": {
        const contents = observer.getInventoryContents();
        if (contents.length === 0) {
          bot.chat(`[${bot.username}] My inventory is empty.`);
        } else {
          // Joining with newline might be better for multiline chat in MC
          const invString = contents.join("\n");
          bot.chat(`[${bot.username}] Inventory:\n${invString}`);
        }
        break;
      }
      case "pullup": {
        const targetPlayerName = parts[1] || "jibbum"; // Default to jibbum if no name given
        const targetPlayer = bot.players[targetPlayerName];
        if (!targetPlayer || !targetPlayer.entity) {
          bot.chat(
            `[${bot.username}] I cannot find player ${targetPlayerName}.`
          );
        } else {
          const { x, y, z } = targetPlayer.entity.position;
          bot.chat(
            `[${bot.username}] Moving to ${targetPlayerName} at (${x.toFixed(
              1
            )}, ${y.toFixed(1)}, ${z.toFixed(1)})...`
          );
          await navigation.move(x, y, z);
          bot.chat(
            `[${bot.username}] Arrived at ${targetPlayerName}'s location!`
          );
        }
        break;
      }
      case "goal:": {
        // Pass the specific agent's bot and functionCaller
        // Reconstruct parts to include "test" for handleTestGoal's original expectation if needed
        await handleTestGoal(bot, functionCaller, ["test", ...parts]);
        // handleTestGoal should handle its own chat responses
        break;
      }
      // Add other test cases here if needed
      default:
        bot.chat(
          `[${bot.username}] Unknown test command: '${command}'. Valid: recipe, craftable, possible, mine, craft, place, attack, allblocks, usetable, inv, pullup, goal:`
        );
    }
  } catch (error: any) {
    console.error(
      `[${bot.username}] Error executing test command '${commandMessage}':`,
      error
    );
    bot.chat(
      `[${bot.username}] Error running command: ${
        error.message || String(error)
      }`
    );
  }
}

