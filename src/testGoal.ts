export async function handleTestGoal(bot: any, functionCaller: any, parts: string[]): Promise<void> {
    // Usage: "test goal: pickaxe"
    const goalItem = parts.slice(2).join(" ");
    if (!goalItem) {
      bot.chat("Usage: test goal: <goal description>");
      return;
    }
    bot.chat(`Goal Accepted`);
  
    // Build a user prompt that includes the bot's current SharedAgentState:
    const userPrompt = `
  You are a Minecraft AI agent. Your goal is: "${goalItem}."
  
  Here is your current SharedAgentState:
  ${functionCaller.getSharedStateAsText()}
  
  Please determine the next step to achieve the goal by making function calls. You must use function calls.
  `;
  
    // Now call the LLM with our function-enabled chat.
    const finalResponse = await functionCaller.callOpenAIWithTools([
      { role: "user", content: userPrompt }
    ]);
  
    // Relay the final response in chat.
    bot.chat(`${finalResponse}`);
  }