import { Memory } from "./memory";
import { SharedAgentState } from "../../sharedAgentState";
import { OpenAI } from "openai";
import { memoryTools } from "./memoryTools";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export async function updateMemoryViaLLM(
  finalResponse: string,
  memory: Memory,
  sharedState: SharedAgentState,
  openai: OpenAI
): Promise<void> {
  const recentConversation = sharedState.conversationLog.slice(-10).join("\n");
  const memoryPrompt = `
You are a minecraft Agent's memory center with biological-like memory formation. Always speak in the first person, because the information you see is happening to you.
Analyze the following recent events and conversation excerpt and decide what key details,
actions, or context to store as memories. Things that may be useful for you to remember in the short term should be sent to the short term Memory.
Use function calls to store relevant memories. Try not to store stats, instead store new things you have learned about the world you are in.
Here is the information:

${recentConversation}
  `.trim();

  const messages: ChatCompletionMessageParam[] = [
    { role: "developer", content: memoryPrompt },
  ];

  const loopLimit = 5;
  let memoryFinalResponse = "";

  for (let loopCount = 0; loopCount < loopLimit; loopCount++) {
    // --- LOG REQUEST ---
    sharedState.logOpenAIRequest("chat.completions.create", {
      model: "gpt-4o",
      messages,
      tools: memoryTools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      store: true
    });

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools: memoryTools,
        tool_choice: "auto",
        parallel_tool_calls: false,
        store: true,
      });
    } catch (error) {
      // Log error
      sharedState.logOpenAIError("chat.completions.create", error);
      break;
    }

    // --- LOG RESPONSE ---
    sharedState.logOpenAIResponse("chat.completions.create", completion);

    const choice = completion.choices[0];
    const msg = choice.message;

    if (msg.content) {
      sharedState.logMessage("memory", msg.content);
    }
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

      try {
        parsedArgs = JSON.parse(argsStr);
      } catch (err) {
        toolCallResult = `ERROR: Could not parse function arguments as JSON. Raw args = ${argsStr}`;
        sharedState.logMessage("function", `Parse error for "${fnName}"`, {
          rawArguments: argsStr,
          error: String(err),
        });
        messages.push({
          role: "function",
          name: fnName,
          content: toolCallResult,
        });
        continue;
      }

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

      sharedState.logMessage("memory", `Tool call: ${fnName}`, {
        arguments: parsedArgs,
        result: toolCallResult,
      });

      const combinedContent = `Memory tool call result: ${toolCallResult}`;
      messages.push({
        role: "function",
        name: fnName,
        content: combinedContent,
      });
    }
  }

  if (!memoryFinalResponse) {
    memoryFinalResponse = "No final memory update from model after function calls.";
  }

  const memoryKey = "memory_" + Date.now();
  await memory.addShortTermMemory(memoryKey, memoryFinalResponse);
  sharedState.logMessage("memory", `Memory updated via LLM: ${memoryFinalResponse}`);
}