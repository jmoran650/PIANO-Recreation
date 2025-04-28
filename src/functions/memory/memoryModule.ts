import { Memory } from './memory';
import { SharedAgentState } from '../../sharedAgentState';
import { OpenAI } from 'openai';
import { memoryTools } from './memoryTools';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { Vec3 } from 'vec3'; // Assuming Vec3 is imported, adjust path as needed

// --- Interfaces for Tool Call Arguments ---
interface AddShortTermMemoryArgs {
  name: string;
  info: string;
}

interface GetOrRemoveMemoryArgs {
  name: string;
}

interface AddLocationMemoryArgs {
  name: string;
  // description: string; // Removed as it was unused
  coords: { x: number, y: number, z: number }; // Use object literal type for JSON parsing
}

// Helper type guard to check if an object is of a specific interface
function isArgsType<T>(obj: unknown, properties: (keyof T)[]): obj is T {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  return properties.every(prop => prop in obj);
}


export async function updateMemoryViaLLM(
  memory: Memory,
  sharedState: SharedAgentState,
  openai: OpenAI
): Promise<void> {
  // Fix 1: Map conversation log entries to strings more robustly before joining
  const recentConversation = sharedState.conversationLog
    .slice(-10)
    .map(entry => {
        // Handle different possible structures of log entries safely
        if (typeof entry === 'string') {
            return entry; // Already a string
        }
        if (entry && typeof entry === 'object') {
            // Prioritize 'content' property if it exists and is string-like
            if ('content' in entry && entry.content != null) {
                return String(entry.content);
            }
            // As a fallback, stringify the object to avoid '[object Object]'
            // This might produce JSON, which is better than the default object string
            try {
              return JSON.stringify(entry);
            } catch {
              return '[Unstringifiable Object]'; // Handle potential stringify errors
            }
        }
        // Handle null, undefined, or other primitive types if necessary
        return String(entry); // Default string conversion for other types
    })
    .join('\n');

  const memoryPrompt = `
You are a minecraft Agent's memory center with biological-like memory formation. Always speak in the first person, because the information you see is happening to you.
Analyze the following recent events and conversation excerpt and decide what key details,
actions, or context to store as memories. Things that may be useful for you to remember in the short term should be sent to the short term Memory.
Use function calls to store relevant memories. Try not to store statistics, instead store new things you have learned about the world you are in, new experiences, and new information.
Here is the information:

${recentConversation}
  `.trim();

  const messages: ChatCompletionMessageParam[] = [
    // Using 'system' role for instructions
    { role: 'system', content: memoryPrompt },
  ];

  const loopLimit = 5;
  let memoryFinalResponse = '';
  let loopCount: number; // Fix 5: Declare loopCount outside the loop scope

  for (loopCount = 0; loopCount < loopLimit; loopCount++) { // Fix 5: Initialize loopCount here
    // --- LOG REQUEST ---
    sharedState.logOpenAIRequest('chat.completions.create', {
      model: 'gpt-4o',
      messages,
      tools: memoryTools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    });

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: memoryTools,
        tool_choice: 'auto',
        parallel_tool_calls: false,
      });
    } catch (error) {
      // Log error
      sharedState.logOpenAIError('chat.completions.create', error);
      break; // Exit loop on API error
    }

    // --- LOG RESPONSE ---
    sharedState.logOpenAIResponse('chat.completions.create', completion);

    const choice = completion.choices[0];
    const msg = choice.message;

    // Add assistant's response (potentially including tool calls) to messages
    // Do this *before* checking for tool calls to ensure history is complete for next turn
    if (msg) {
        messages.push(msg);
    } else {
        // Handle case where msg is unexpectedly null/undefined
        sharedState.logMessage('memory', 'Warning: Received null/undefined message from OpenAI.');
        memoryFinalResponse = 'Received empty response from model.';
        break;
    }


    if (msg.content) {
      sharedState.logMessage('memory', msg.content);
    }

    // If no tool calls are present, the assistant's response (msg.content) is the final one for this cycle.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      memoryFinalResponse = msg.content || ''; // Use content if available
      break; // Exit loop as no further tool processing is needed
    }

    // Process each tool call requested by the assistant.
    for (const toolCall of msg.tool_calls) {
      const fnName = toolCall.function.name;
      const argsStr = toolCall.function.arguments;
      let toolCallResult = '';
      let parsedArgs: Record<string, unknown>;

      try {
        // Fix 2: Use type assertion to satisfy eslint, acknowledging JSON.parse returns 'any'
        parsedArgs = JSON.parse(argsStr) as Record<string, unknown>;
        if (typeof parsedArgs !== 'object' || parsedArgs === null) {
          throw new Error('Parsed arguments are not an object.');
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        toolCallResult = `ERROR: Could not parse function arguments as JSON or result was not an object. Raw args = ${argsStr}. Error: ${error}`;
        sharedState.logMessage('function', `Parse error for "${fnName}"`, {
          rawArguments: argsStr,
          error: error,
        });
        // Fix 3: Remove 'name' property from tool response message
        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          // name: fnName, // Removed
          content: toolCallResult,
        });
        continue; // Skip to next tool call
      }

      // Apply interfaces and type guards in the switch statement
      try {
        switch (fnName) {
          case 'addShortTermMemory': {
            if (isArgsType<AddShortTermMemoryArgs>(parsedArgs, ['name', 'info']) && typeof parsedArgs.name === 'string' && typeof parsedArgs.info === 'string') {
              const { name, info } = parsedArgs;
              memory.addShortTermMemory(name, info);
              toolCallResult = `Added short term memory with key "${name}".`;
            } else {
              toolCallResult = `ERROR: Invalid arguments for ${fnName}. Expected { name: string, info: string }. Received: ${JSON.stringify(parsedArgs)}`;
            }
            break;
          }
          case 'getShortTermMemory': {
             if (isArgsType<GetOrRemoveMemoryArgs>(parsedArgs, ['name']) && typeof parsedArgs.name === 'string') {
              const { name } = parsedArgs;
              const result = memory.getShortTermMemory(name); // Assuming sync or await if async
              toolCallResult = `Retrieved short term memory for "${name}": ${result ?? 'Not found'}`;
            } else {
               toolCallResult = `ERROR: Invalid arguments for ${fnName}. Expected { name: string }. Received: ${JSON.stringify(parsedArgs)}`;
            }
            break;
          }
          case 'removeShortTermMemory': {
             if (isArgsType<GetOrRemoveMemoryArgs>(parsedArgs, ['name']) && typeof parsedArgs.name === 'string') {
              const { name } = parsedArgs;
              memory.removeShortTermMemory(name);
              toolCallResult = `Removed short term memory with key "${name}".`;
            } else {
               toolCallResult = `ERROR: Invalid arguments for ${fnName}. Expected { name: string }. Received: ${JSON.stringify(parsedArgs)}`;
            }
            break;
          }
          case 'getLongTermMemory': {
             if (isArgsType<GetOrRemoveMemoryArgs>(parsedArgs, ['name']) && typeof parsedArgs.name === 'string') {
              const { name } = parsedArgs;
              const result = memory.getLongTermMemory(name); // Assuming sync or await if async
              toolCallResult = `Retrieved long term memory for "${name}": ${result ?? 'Not found'}`;
            } else {
               toolCallResult = `ERROR: Invalid arguments for ${fnName}. Expected { name: string }. Received: ${JSON.stringify(parsedArgs)}`;
            }
            break;
          }
          case 'addLocationMemory': {
             // Check for 'name' and 'coords' with x, y, z properties
            if (isArgsType<AddLocationMemoryArgs>(parsedArgs, ['name', 'coords']) && typeof parsedArgs.name === 'string' && typeof parsedArgs.coords === 'object' && parsedArgs.coords !== null && 'x' in parsedArgs.coords && typeof parsedArgs.coords.x === 'number' && 'y' in parsedArgs.coords && typeof parsedArgs.coords.y === 'number' && 'z' in parsedArgs.coords && typeof parsedArgs.coords.z === 'number') {
              const { name, coords } = parsedArgs;
              // Construct Vec3 instance from parsed coords object
              const vec3Coords = new Vec3(coords.x, coords.y, coords.z);
              memory.addLocationMemory(name, vec3Coords); // Assuming sync or await if async
              toolCallResult = `Added location memory "${name}".`;
            } else {
               toolCallResult = `ERROR: Invalid arguments for ${fnName}. Expected { name: string, coords: {x: number, y: number, z: number} }. Received: ${JSON.stringify(parsedArgs)}`;
            }
            break;
          }
          case 'getLocationMemory': {
             if (isArgsType<GetOrRemoveMemoryArgs>(parsedArgs, ['name']) && typeof parsedArgs.name === 'string') {
              const { name } = parsedArgs;
              const result = memory.getLocationMemory(name); // Assuming sync or await if async
              const resultString = result ? `x: ${result.x}, y: ${result.y}, z: ${result.z}` : 'Not found';
              toolCallResult = `Retrieved location memory "${name}": ${resultString}`;
            } else {
               toolCallResult = `ERROR: Invalid arguments for ${fnName}. Expected { name: string }. Received: ${JSON.stringify(parsedArgs)}`;
            }
            break;
          }
          default:
            toolCallResult = `Function "${fnName}" not implemented in memory module.`;
            break;
        }
      } catch (err) {
        console.error('Error calling memory function:', fnName, err);
        const error = err instanceof Error ? err.message : String(err);
        toolCallResult = `ERROR calling function "${fnName}" with args ${JSON.stringify(parsedArgs)}: ${error}`;
      }

      sharedState.logMessage('memory', `Tool call: ${fnName}`, {
        arguments: parsedArgs,
        result: toolCallResult,
      });

      // Fix 4: Remove 'name' property from tool response message
      // Push the tool result back to the message history for the LLM
      messages.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        // name: fnName, // Removed
        content: toolCallResult,
      });
    }
    // After processing all tool calls for this iteration, the loop continues for the LLM's next response
  } // End of for loop

  // Fix 5: Check loopCount after the loop finishes
  // Ensure memoryFinalResponse has a default value if no content was generated
  if (!memoryFinalResponse && loopCount === loopLimit) {
     memoryFinalResponse = 'Memory processing reached loop limit without final response from model.';
     sharedState.logMessage('memory', 'Warning: Memory loop limit reached.');
  } else if (!memoryFinalResponse) {
    // This case might occur if the last message from the LLM consisted *only* of tool calls
    // and the loop didn't break early due to an error or reaching the limit.
    memoryFinalResponse = 'Memory processing completed with tool calls, but no final text summary was generated by the model.';
    sharedState.logMessage('memory', 'Note: No final text summary generated after tool calls.');
  }

  // Store the final textual response from the LLM (if any meaningful one exists) as a short-term memory.
  // Only store if the final response isn't just an error/warning message generated by this code.
  if (memoryFinalResponse && !memoryFinalResponse.startsWith('Memory processing reached loop limit') && !memoryFinalResponse.startsWith('Received empty response') && !memoryFinalResponse.startsWith('Memory processing completed with tool calls')) {
    const memoryKey = 'llm_summary_' + Date.now();
    memory.addShortTermMemory(memoryKey, memoryFinalResponse);
    sharedState.logMessage('memory', `LLM Memory Summary added: "${memoryFinalResponse}"`);
  } else {
    sharedState.logMessage('memory', `No meaningful LLM summary to store. Final response was: "${memoryFinalResponse}"`);
  }
}