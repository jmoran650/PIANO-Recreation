// src/chatTests.ts

import { AgentBot } from './createAgentBot';
import { handleTestGoal } from './testGoal';

export async function handleChatTestCommand(
  agent: AgentBot, // AgentBot now contains 'services' instead of 'actions'
  username: string,
  commandMessage: string
): Promise<void> {
  if (username === agent.bot.username) return;

  // Destructure necessary components from the agent object
  const {
      bot,
      observer,
      navigation,
      functionCaller, // Keep functionCaller if needed for 'test goal:'
      actionServices // Destructure the services bundle
  } = agent;

  // Destructure individual services for easier access
  const {
      miningService,
      craftingService,
      buildingService,
      combatService,
      // Add other services if new test commands require them
  } = actionServices;

  const parts = commandMessage.split(' ');
  const command = parts[0]?.toLowerCase();

  bot.chat(`[${bot.username}] Executing test command: ${commandMessage}`);

  try {
    switch (command) {
      case 'recipe':
      case 'craftable':
      case 'possible':
      case 'allblocks':
      case 'inv': {
        // These commands primarily use 'observer' which is still directly available
        const itemName = parts.slice(1).join('_'); // Used by recipe, craftable, possible
        const radius = parseInt(parts[1] || '10', 10); // Used by allblocks

        if (command === 'recipe') {
          if (!itemName) {
            bot.chat(`[${bot.username}] Usage: test recipe <itemName>`); return;
          }
          const recipeInfo = observer.getRecipeForItem(itemName);
          bot.chat(`[${bot.username}] ${recipeInfo}`);
        } else if (command === 'craftable') {
          if (!itemName) {
             bot.chat(`[${bot.username}] Usage: test craftable <itemName>`); return;
          }
          const canCraft = observer.canCraftItem(itemName);
          bot.chat(`[${bot.username}] ${canCraft ? `Yes, I can craft "${itemName}" immediately.` : `No, I cannot craft "${itemName}" immediately.`}`);
        } else if (command === 'possible') {
           if (!itemName) {
             bot.chat(`[${bot.username}] Usage: test possible <itemName>`); return;
           }
           const canEventually = observer.canEventuallyCraftItem(itemName);
           bot.chat(`[${bot.username}] ${canEventually ? `Yes, it is possible to craft "${itemName}" eventually.` : `No, it is not possible to craft "${itemName}".`}`);
        } else if (command === 'allblocks') {
            const blocks = await observer.getAllBlocksInRadius(radius);
            const blockList = blocks.map(b => `${b.name}(${b.x},${b.y},${b.z})`).join(', ');
            const output = `[${bot.username}] Detailed Blocks (${radius} radius): ${blockList || 'None found'}`;
            bot.chat(output.substring(0, 250)); // Limit chat length
            console.log(`[${bot.username}] All blocks (${radius}): ${blockList}`);
        } else if (command === 'inv') {
            const contents = observer.getInventoryContents();
            if (contents.length === 0) {
              bot.chat(`[${bot.username}] My inventory is empty.`);
            } else {
              const invString = contents.join('\n'); // Maybe format better later
              bot.chat(`[${bot.username}] Inventory:\n${invString}`);
            }
        }
        break;
      }

      // Command using Navigation (No change needed)
      case 'pullup': {
        const targetPlayerName = parts[1] || 'jibbum'; // Default target?
        const targetPlayer = bot.players[targetPlayerName];
        if (!targetPlayer || !targetPlayer.entity) {
          bot.chat(`[${bot.username}] I cannot find player ${targetPlayerName}.`);
        } else {
          const { x, y, z } = targetPlayer.entity.position;
          bot.chat(`[${bot.username}] Moving to ${targetPlayerName} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})...`);
          await navigation.move(x, y, z); // Use navigation directly
          bot.chat(`[${bot.username}] Arrived at ${targetPlayerName}'s location!`);
        }
        break;
      }

       // Command using FunctionCaller (No change needed, assuming handleTestGoal is correct)
       case 'goal:': {
        await handleTestGoal(bot, functionCaller, ['test', ...parts]);
        break;
      }

      // --- Commands using Action Services (NEED UPDATING) ---

      case 'mine': {
        const blockName = parts[1];
        const desiredCount = parseInt(parts[2] || '1', 10);
        if (!blockName || isNaN(desiredCount)) {
          bot.chat(`[${bot.username}] Usage: test mine <blockName> [count]`);
          return;
        }
        // Use the MiningService
        await miningService.mine(blockName, desiredCount);
        bot.chat(`[${bot.username}] Finished mine task for ${blockName}.`);
        break;
      }


      case 'place': {
        const blockType = parts[1];
        if (!blockType) {
          bot.chat(`[${bot.username}] Usage: test place <blockType>`);
          return;
        }
        // Use the BuildingService
        // Note: This will now throw an error if blockType is not in inventory.
        await buildingService.placeBlock(blockType);
        bot.chat(`[${bot.username}] Finished place task for ${blockType}.`);
        break;
      }

      case 'attack': {
        const mobType = parts[1];
        if (!mobType) {
          bot.chat(`[${bot.username}] Usage: test attack <mobType>`);
          return;
        }
        // Use the CombatService
        combatService.attack(mobType);
        bot.chat(`[${bot.username}] Initiated attack on ${mobType}.`);
        break;
      }

      case 'usetable': {
        // Use the CraftingService
        await craftingService.useCraftingTable();
        bot.chat(`[${bot.username}] Attempted to use crafting table.`);
        break;
      }

      default:
        bot.chat(
          `[${bot.username}] Unknown test command: '${command}'. Valid: recipe, craftable, possible, mine, craft, place, attack, allblocks, usetable, inv, pullup, goal:`
        );
    }
  } catch (err: unknown) {
    // General error handling for the command execution
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[${bot.username}] Error executing test command '${commandMessage}':`,
      msg
    );
    bot.chat(
      `[${bot.username}] Error running command: ${msg}`
    );
  }
}