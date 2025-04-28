import { Bot } from 'mineflayer'; // Assuming 'mineflayer' is used for the bot type
import OpenAI from 'openai'; // Import OpenAI types for message parameters

/**
 * Defines the expected interface for the object responsible for
 * interacting with the agent's state and calling the OpenAI API.
 */
interface IFunctionCaller {
	/**
	 * Retrieves the current state of the agent as a text description.
	 */
	getSharedStateAsText(): string;

	/**
	 * Calls the OpenAI API with function/tool capabilities.
	 * @param messages The array of messages for the chat completion request.
	 * @returns A promise that resolves to the final string response to be relayed.
	 */
	callOpenAIWithTools(
		messages: OpenAI.Chat.ChatCompletionMessageParam[]
	): Promise<string>; // Assuming the result to be chatted is a string
}

/**
 * Handles the 'test goal:' command to initiate a goal-oriented task for the AI.
 * @param bot - The mineflayer bot instance.
 * @param functionCaller - An object capable of getting state and calling OpenAI.
 * @param parts - The command parts, where parts[2:] form the goal description.
 */
export async function handleTestGoal(
	bot: Bot, // Use the specific Bot type
	functionCaller: IFunctionCaller, // Use the defined interface
	parts: string[]
): Promise<void> {
	// Usage: "test goal: pickaxe"

	// Extract the goal description from the command parts
	const goal = parts.slice(2).join(' ');
	if (!goal) {
		// Safely call bot.chat
		bot.chat('Usage: test goal: <goal description>');
		return;
	}

	// Safely call bot.chat
	bot.chat("I'm alive!");
	// Safely access bot.username
	const botName = bot.username;

	// Build the system prompt using the agent's current state
	// Safely call functionCaller.getSharedStateAsText
	const systemPrompt = `
You are a Minecraft AI agent named ${botName}. You have the following goal: "${goal}."
You are living in the world of minecraft. The following information is from the minecraft world that you exist in.
When you are talking, remember that you live in minecraft and minecraft is your reality. Your only way to interact with the world around you is using function calls.
You use function calls to communicate with others and to interact with the world around you.
Here is the information you have:
${functionCaller.getSharedStateAsText()}

Use a function call to complete the next step towards your goal. You MUST use function calls in every response.
`;

	// Define the messages array with the correct type for the API call
	const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
		{ role: 'system', content: systemPrompt },
	];

	// Call the LLM with function-calling capabilities
	// Safely call functionCaller.callOpenAIWithTools
	// Type safety ensured for the await and assignment
	const finalResponse: string = await functionCaller.callOpenAIWithTools(
		messages
	);

	// Relay the final response in chat
	// Safely call bot.chat with the string response
	bot.chat(finalResponse);
}