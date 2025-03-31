// index.ts

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

import { AgentBot, createAgentBot } from "./src/createAgentBot";

// Store agent references globally or pass them appropriately
let agent: AgentBot;
let agent2: AgentBot; // Represents DaBiggestBird

export async function main(): Promise<{ agent: AgentBot; agent2: AgentBot }> {
  // Return both agents
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

    return { agent, agent2 }; // Return both if needed externally
  } catch (err) {
    console.error("Failed to create AgentBots:", err);
    throw err;
  }
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
