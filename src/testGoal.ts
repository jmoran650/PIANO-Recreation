export async function handleTestGoal(bot: any, functionCaller: any, parts: string[]): Promise<void> {
    // Usage: "test goal: pickaxe"

    const goal = parts.slice(2).join(" ");
    if (!goal) {
      bot.chat("Usage: test goal: <goal description>");
      return;
    }
    bot.chat(`I'm alive!`);
    const botName = bot.username;
    // Build a user prompt that includes the bot's current SharedAgentState:
    const systemPrompt = `
  You are a Minecraft AI agent named ${botName}. You have the following goal: "${goal}."
  You are living in the world of minecraft. The following information is from the minecraft world that you exist in.
  When you are talking, remember that you live in minecraft and minecraft is your reality. Your only way to interact with the world around you is using function calls.
  You use function calls to communicate with others and to interact with the world around you.
  Here is the information you have:
  ${functionCaller.getSharedStateAsText()}
  
  Use a function call to complete the next step towards your goal. You MUST use function calls.
  `;
  
    // Now call the LLM with our function-enabled chat.
    const finalResponse = await functionCaller.callOpenAIWithTools([
      { role: "system", content: systemPrompt }
    ]);
  
    // Relay the final response in chat.
    bot.chat(`${finalResponse}`);
  }