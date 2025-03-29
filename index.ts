// index.ts

// import { Bot } from "mineflayer"
// import { mineflayer as mineflayerViewer } from "prismarine-viewer"
// import { goals as pfGoals } from "mineflayer-pathfinder" // Renamed import for clarity.
// import minecraftData from "minecraft-data"
if (process.env.OPENAI_API_KEY) {
  console.log("api key found");
} else {
  console.log("api key NOT FOUND");
}

if (process.env.MINECRAFT_VERSION) {
  console.log("minecraft version found");
} else {
  console.log("MINECRAFT VERSION NOT FOUND");
}

import { createAgentBot, AgentBot } from "./createAgentBot";
import { handleChatTestCommand } from "./src/chatTests"; // Import the new function

// Store agent references globally or pass them appropriately
let agent: AgentBot;
let agent2: AgentBot; // Represents DaBiggestBird


export async function main(): Promise<{ agent: AgentBot, agent2: AgentBot }> { // Return both agents
    try {
        // Create both bots
        // Ensure createAgentBot returns the full AgentBot structure
        agent2 = await createAgentBot({
            host: "10.0.0.51",
            port: 25565,
            username: "DaBiggestBird",
            version: process.env.MINECRAFT_VERSION,
        });
        agent = await createAgentBot({
            host: "10.0.0.51",
            port: 25565,
            username: "AgentBot",
            version: process.env.MINECRAFT_VERSION,
        });

        // Setup listener for AgentBot (primary)
        setupChatListener(agent, agent2); // Pass both agents for context

        // Setup listener for DaBiggestBird (secondary)
        setupChatListener(agent2, agent); // Pass both agents for context

        console.log("Both bots initialized and chat listeners active.");

        return { agent, agent2 }; // Return both if needed externally
    } catch (err) {
        console.error("Failed to create AgentBots:", err);
        throw err;
    }
}

// Helper function to set up listeners to avoid repetition
function setupChatListener(listeningAgent: AgentBot, otherAgent: AgentBot) {
    const { bot: listeningBot } = listeningAgent;

    listeningBot.on("chat", async (username: string, message: string) => {
        // Ignore messages sent by the bot itself
        if (username === listeningBot.username) return;

        let targetBots: AgentBot[] = [];
        let commandMessage: string = "";
        let isPrefixed = false;
        let isTargeted = false; // Was this specific bot targeted by a prefix?

        // 1. Determine Target and Command Message based on prefix
        if (message.startsWith("ab:")) {
            commandMessage = message.substring(3).trim();
            isPrefixed = true;
            // agent is AgentBot (global/module scope assumed)
            if (listeningAgent === agent) { // Check if this listener is for AgentBot
                 targetBots = [agent];
                 isTargeted = true;
            } else {
                // This listener is for dbb, but command is for ab - do nothing here
                 return;
            }
        } else if (message.startsWith("dbb:")) {
            commandMessage = message.substring(4).trim();
            isPrefixed = true;
             // agent2 is DaBiggestBird (global/module scope assumed)
            if (listeningAgent === agent2) { // Check if this listener is for DaBiggestBird
                 targetBots = [agent2];
                 isTargeted = true;
            } else {
                 // This listener is for ab, but command is for dbb - do nothing here
                 return;
            }
        } else if (message.startsWith("all:")) {
            commandMessage = message.substring(4).trim();
            isPrefixed = true;
            // Target both bots regardless of which listener caught it
            targetBots = [agent, agent2];
             // Mark as targeted if this bot is part of "all"
            isTargeted = (listeningAgent === agent || listeningAgent === agent2);
        } else {
            // Default: No prefix, command applies only to the bot receiving it
            targetBots = [listeningAgent];
            commandMessage = message;
            isPrefixed = false;
            isTargeted = true; // Default commands target the listener
        }

         // If this bot wasn't targeted by a prefix or 'all', and it wasn't a default command, stop.
        if (!isTargeted) return;


        // 2. Check if it's a "test" command and execute
        if (commandMessage.startsWith("test ")) {
            const testCommand = commandMessage.substring(5).trim();

            // Execute the test command for all bots determined earlier
            // (which will be just this bot unless 'all:' was used)
            for (const targetAgent of targetBots) {
                 // We already filtered based on prefix, so just execute if targetAgent is the current listeningAgent
                 // Or if 'all' was specified (in which case targetBots contains both)
                if (targetAgent === listeningAgent) {
                    await handleChatTestCommand(targetAgent, username, testCommand);
                }
            }
        }
        // 3. Handle non-test commands (only if no prefix was used or if 'all' wasn't used)
        // These commands generally only make sense for the specific bot that received the chat directly.
        else if (!isPrefixed) {
            const { observer, navigation } = listeningAgent; // Use the listening agent's components
            switch (commandMessage) {
                case "blocks": {
                    const visibleBlocksResult = await observer.getVisibleBlockTypes();
                    const blocksStr = Object.entries(visibleBlocksResult.BlockTypes)
                        .map(([blockName, { x, y, z }]) => `${blockName}@(${x.toFixed(0)},${y.toFixed(0)},${z.toFixed(0)})`)
                        .join(", ");
                    listeningBot.chat(`[${listeningBot.username}] Blocks: ${blocksStr || "None"}`);
                    break;
                }
                case "mobs": {
                    const visibleMobsResult = await observer.getVisibleMobs();
                    const mobsStr = visibleMobsResult.Mobs.map(
                        (mob) => `${mob.name}(${mob.distance.toFixed(1)}m)`
                    ).join(", ");
                    listeningBot.chat(`[${listeningBot.username}] Mobs: ${mobsStr || "None"}`);
                    break;
                }
                case "tome":
                    listeningBot.chat(`/tp ${username}`); // Teleport to the player who chatted
                    break;

                case "wood": {
                    // Find and move to nearest wood (simplified example)
                     const visibleBlocksResult = await observer.getVisibleBlockTypes();
                     const blockTypes = visibleBlocksResult.BlockTypes;
                     const woodCandidates = Object.keys(blockTypes).filter(
                         (name) => name.includes("log") // Simplified check
                     );
                     if (woodCandidates.length === 0) {
                         listeningBot.chat(`[${listeningBot.username}] No wood nearby.`);
                         return;
                     }
                     const woodName = woodCandidates[0];
                     const { x, y, z } = blockTypes[woodName];
                     listeningBot.chat(`[${listeningBot.username}] Moving to ${woodName}...`);
                     try {
                         await navigation.move(x, y, z);
                         listeningBot.chat(`[${listeningBot.username}] Arrived at wood.`);
                     } catch (e) {
                         listeningBot.chat(`[${listeningBot.username}] Failed to move to wood: ${e}`);
                     }
                    break;
                 }
                case "move": {
                     // Move 10 blocks +x (example)
                    const { x, y, z } = listeningAgent.bot.entity.position;
                    const targetX = Math.floor(x + 10);
                    const targetY = Math.floor(y); // Keep same Y level roughly
                    const targetZ = Math.floor(z);
                    listeningBot.chat(`[${listeningBot.username}] Moving +10 X...`);
                     try {
                         await navigation.move(targetX, targetY, targetZ);
                         listeningBot.chat(`[${listeningBot.username}] Arrived.`);
                     } catch (e) {
                          listeningBot.chat(`[${listeningBot.username}] Failed to move: ${e}`);
                     }
                    break;
                 }
                // Add any other non-test, non-prefixed commands here
                default:
                    // Optional: Log unhandled messages or ignore
                    // console.log(`[${listeningBot.username}] Unhandled message from ${username}: ${message}`);
                    break;
            }
        }
        // If the message was prefixed ('ab:', 'dbb:', 'all:') but *not* a 'test' command, it's ignored here.
    });

    listeningBot.on("error", (err) => {
        console.error(`[${listeningBot.username}] Bot error:`, err);
    });

     listeningBot.on("kicked", (reason) => {
        console.error(`[${listeningBot.username}] Kicked for:`, reason);
    });

     listeningBot.on("end", (reason) => {
        console.log(`[${listeningBot.username}] Disconnected:`, reason);
        // Optional: Implement reconnection logic here
    });
}

// // Start the application by calling main
// main().catch(err => {
//     console.error("Application failed to start:", err);
//     process.exit(1); // Exit if initialization fails
// });

// // Add process error handlers if not already present
// process.on('unhandledRejection', (reason, promise) => {
//   console.error('<<<<< UNHANDLED REJECTION index.ts >>>>>');
//   console.error('Reason:', reason);
//   // console.error('Promise:', promise); // Can be verbose
//   console.error('<<<<< /UNHANDLED REJECTION >>>>>');
// });
// process.on('uncaughtException', (error, origin) => {
//   console.error('<<<<< UNCAUGHT EXCEPTION index.ts >>>>>');
//   console.error('Error:', error);
//   console.error('Origin:', origin);
//   console.error('<<<<< /UNCAUGHT EXCEPTION >>>>>');
//   // It's often recommended to exit after an uncaught exception
//   // process.exit(1);
// });