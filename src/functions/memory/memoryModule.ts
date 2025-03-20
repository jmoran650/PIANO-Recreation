// src/functions/memoryModule.ts

import { Memory } from "./memory";
import { SharedAgentState } from "../../sharedAgentState";
import { OpenAI } from "openai";
import { memoryTools } from "./memoryTools";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";


/**
 * updateMemoryViaLLM:
 * Calls the LLM (acting as the bot's memory center) with a prompt based on recent conversation.
 * Processes any function (tool) calls returned by the LLM, executing them against the Memory module.
 * Finally, stores a final memory summary entry.
 *
 * @param finalResponse - The fallback final response text from the conversation cycle.
 * @param memory - An instance of the Memory module.
 * @param sharedState - The shared state containing the conversation log and other context.
 * @param openai - The OpenAI client instance.
 */
export async function updateMemoryViaLLM(
  finalResponse: string,
  memory: Memory,
  sharedState: SharedAgentState,
  openai: OpenAI,
): Promise<void> {
  // Gather a recent excerpt from the conversation log.
  const recentConversation = sharedState.conversationLog.slice(-10).join("\n");
  const memoryPrompt = `
You are a minecraft Agent's memory center with biological-like memory formation. Always speak in the first person, because the information you see is happening to you.
Analyze the following recent events and conversation excerpt and decide what key details,
actions, or context to store as memories. Things that may be useful for you to remember in the short term should be sent to the short term Memory.
Use function calls to store relevant memories. Try not to store stats, instead store new things you have learned about the world you are in.
Here is the information:
${recentConversation}
  `.trim();

  // Begin with a user message containing the memory prompt.

  const messages: ChatCompletionMessageParam[] = [
    { role: "developer", content: memoryPrompt },
  ];

  // Allow multiple rounds for function calls, up to a loop limit.
  const loopLimit = 5;
  let memoryFinalResponse = "";

  for (let loopCount = 0; loopCount < loopLimit; loopCount++) {
    // Send the current conversation (with any function call messages) to the LLM.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: memoryTools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      store: true,
    });

    const choice = completion.choices[0];
    const msg = choice.message;

    // Log any content from the assistant's response.
    if (msg.content) {
      sharedState.logMessage("memory", msg.content);
    }

    // If there are no tool calls, we assume this is the final response.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      memoryFinalResponse = msg.content || "";
      break;
    }

    // Process each tool call in sequence.
    for (const toolCall of msg.tool_calls) {
      const fnName = toolCall.function.name;
      const argsStr = toolCall.function.arguments;
      let toolCallResult = "";
      let parsedArgs: any;

      // Attempt to parse the function arguments as JSON.
      try {
        parsedArgs = JSON.parse(argsStr);
      } catch (err) {
        toolCallResult = `ERROR: Could not parse function arguments as JSON. Raw args = ${argsStr}`;
        sharedState.logMessage("function", `Parse error for "${fnName}"`, {
          rawArguments: argsStr,
          error: String(err),
        });
        // Append an error message so the LLM can try to recover.
        messages.push({
          role: "function",
          name: fnName,
          content: toolCallResult,
        });
        continue;
      }

      // Execute the corresponding memory function.
      try {
        switch (fnName) {
          case "addShortTermMemory": {
            const { name, info } = parsedArgs;
            await memory.addShortTermMemory(name, info);
            toolCallResult = `Added short term memory with key "${name}".`;
            break;
          }
          case "getShortTermMemory": {
            const { name } = parsedArgs;
            const result = await memory.getShortTermMemory(name);
            toolCallResult = `Retrieved short term memory for "${name}": ${result}`;
            break;
          }
          case "removeShortTermMemory": {
            const { name } = parsedArgs;
            await memory.removeShortTermMemory(name);
            toolCallResult = `Removed short term memory with key "${name}".`;
            break;
          }
          case "getLongTermMemory": {
            const { name } = parsedArgs;
            const result = await memory.getLongTermMemory(name);
            toolCallResult = `Retrieved long term memory for "${name}": ${result}`;
            break;
          }
          case "addLocationMemory": {
            const { name, description, coords } = parsedArgs;
            await memory.addLocationMemory(name, coords);
            toolCallResult = `Added location memory "${name}".`;
            break;
          }
          case "getLocationMemory": {
            const { name } = parsedArgs;
            const result = await memory.getLocationMemory(name);
            toolCallResult = `Retrieved location memory "${name}": ${result}`;
            break;
          }
          default:
            toolCallResult = `Function "${fnName}" not implemented in memory module.`;
            break;
        }
      } catch (err) {
        console.error("Error calling memory function:", fnName, err);
        toolCallResult = `ERROR calling function "${fnName}": ${String(err)}`;
      }

      // Log the function call along with its arguments and result.
      sharedState.logMessage("memory", `Tool call: ${fnName}`, {
        arguments: parsedArgs,
        result: toolCallResult,
      });

      // Create a combined message containing the result so the LLM can see the updated state.
      const combinedContent = `Memory tool call result: ${toolCallResult}`;
      messages.push({
        role: "function",
        name: fnName,
        content: combinedContent,
      });
    }
  }

  // If no final response was received after the loop, use a default.
  if (!memoryFinalResponse) {
    memoryFinalResponse = "No final memory update from model after function calls.";
  }
  // Optionally, store the final memory summary as a new short term memory entry.
  const memoryKey = "memory_" + Date.now();
  await memory.addShortTermMemory(memoryKey, memoryFinalResponse);
  sharedState.logMessage("memory", `Memory updated via LLM: ${memoryFinalResponse}`);
}