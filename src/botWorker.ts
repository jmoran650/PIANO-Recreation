import dotenv from 'dotenv';
import { parentPort, workerData, isMainThread } from 'worker_threads';
import { AgentBot, BotOptions, createAgentBot } from './createAgentBot';
import { StepNode, buildGoalTree } from './goalPlanner'; // Assuming goalPlanner exists

import { SerializedState, serializeSharedState } from './server/serverUtils';
import { handleChatTestCommand } from './chatTests';
import type { LogEntry } from '../types/log.types';
import OpenAI from 'openai';

dotenv.config();

// --- Interfaces & Enums ---

export interface ChatRequestData {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  model?: string;
  tools?: OpenAI.Chat.ChatCompletionTool[];
  tool_choice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
  parallel_tool_calls?: boolean;
}

export interface JsonRequestData {
  systemMsg: string;
  userMsg: string;
  jsonSchema: unknown;
}

type ParsedJsonResponse = unknown;

const ALL_PREFIX = 'all:';
const TEST_COMMAND_PREFIX = 'test ';
const BLOCKS_COMMAND = 'blocks';
const MOBS_COMMAND = 'mobs';
const TOME_COMMAND = 'tome';

export enum MessageType {
  GetState = 'getState',
  StateUpdate = 'stateUpdate',
  LlmRequest = 'llmRequest',
  LlmResponse = 'llmResponse',
  StartGoalPlan = 'startGoalPlan',
  GoalPlanProgress = 'goalPlanProgress',
  GoalPlanComplete = 'goalPlanComplete',
  GoalPlanError = 'goalPlanError',
  Initialized = 'initialized',
  InitializationError = 'initializationError',
  LogEntry = 'logEntry',
  BotError = 'botError',
  BotKicked = 'botKicked',
  BotEnd = 'botEnd',
}

interface StateUpdatePayload { username: string; state: SerializedState; }
export interface LlmResponsePayload {
    response?: unknown;
    error?: string;
}
export interface StartGoalPlanPayload { goal: string; mode: 'bfs' | 'dfs'; }
export interface GoalPlanProgressPayload { username: string; tree: StepNode[]; }
export interface GoalPlanCompletePayload { username: string; tree: StepNode[]; }
export interface GoalPlanErrorPayload { username: string; error: string; }
export interface InitializedPayload { username: string; }
export interface InitializationErrorPayload { username: string; error: string; }
export interface LogEntryPayload { username: string; entry: LogEntry; }
export interface BotErrorPayload { username: string; error: string; }
export interface BotKickedPayload { username: string; reason: string; }
export interface BotEndPayload { username: string; reason: string; }

export type WorkerMessage =
  | { type: MessageType.GetState; requestId?: string }
  | { type: MessageType.StateUpdate; requestId?: string; payload: StateUpdatePayload }
  | { type: MessageType.LlmRequest; requestId: string; payload: { type: 'chat', data: ChatRequestData } }
  | { type: MessageType.LlmRequest; requestId: string; payload: { type: 'json', data: JsonRequestData } }
  | { type: MessageType.LlmResponse; requestId: string; payload: LlmResponsePayload }
  | { type: MessageType.StartGoalPlan; requestId?: string; payload: StartGoalPlanPayload }
  | { type: MessageType.GoalPlanProgress; requestId?: string; payload: GoalPlanProgressPayload }
  | { type: MessageType.GoalPlanComplete; requestId?: string; payload: GoalPlanCompletePayload }
  | { type: MessageType.GoalPlanError; requestId?: string; payload: GoalPlanErrorPayload }
  | { type: MessageType.Initialized; requestId?: string; payload: InitializedPayload }
  | { type: MessageType.InitializationError; requestId?: string; payload: InitializationErrorPayload }
  | { type: MessageType.LogEntry; requestId?: string; payload: LogEntryPayload }
  | { type: MessageType.BotError; requestId?: string; payload: BotErrorPayload }
  | { type: MessageType.BotKicked; requestId?: string; payload: BotKickedPayload }
  | { type: MessageType.BotEnd; requestId?: string; payload: BotEndPayload };

interface ParsedChatMessage {
  isTargeted: boolean;
  isPrefixed: boolean;
  command: string;
}

// --- Worker State ---
let agentBotInstance: AgentBot | null = null;
// REMOVED Top-level access to workerData:
// const botOptions = workerData as BotOptions;
// const botUsername: string = botOptions.username;
// const botAcronym: string | undefined = botOptions.acronym;

const llmRequestPromises = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    requestType: 'chat' | 'json';
  }
>();
let llmRequestIdCounter = 0;

// --- Utility Functions ---
function assertIsWorkerThread(): void {
  if (!parentPort) {
    throw new Error('This script must be run as a worker thread.');
  }
}

function safePostMessage(message: WorkerMessage): void {
  if (parentPort) {
    parentPort.postMessage(message);
  } else {
    // Use logWarn, but we need botUsername context, maybe pass it or log generically
    console.warn(`[Worker UNKNOWN] parentPort is null, cannot send message type: ${message.type}`);
  }
}

// Modified logging functions to accept username prefix
function logInfo(message: string, botUsername: string | null = null, ...optionalParams: unknown[]): void {
  const prefix = botUsername ? `[Worker ${botUsername}]` : '[Worker UNKNOWN]';
  console.log(`${prefix} ${message}`, ...optionalParams);
}

function logWarn(message: string, botUsername: string | null = null, ...optionalParams: unknown[]): void {
  const prefix = botUsername ? `[Worker ${botUsername}]` : '[Worker UNKNOWN]';
  console.warn(`${prefix} ${message}`, ...optionalParams);
}

function logError(message: string, botUsername: string | null = null, ...optionalParams: unknown[]): void {
  const prefix = botUsername ? `[Worker ${botUsername}]` : '[Worker UNKNOWN]';
  console.error(`${prefix} ${message}`, ...optionalParams);
}

// --- Initialization and Event Setup ---
async function initializeBotInstance(options: BotOptions): Promise<AgentBot> {
  try {
    const bot = await createAgentBot(options);
    if (!bot) {
      throw new Error('createAgentBot returned null or undefined.');
    }
    // Log info will happen inside runWorker now
    return bot;
  } catch (error) {
    // Log error will happen inside runWorker now
    throw error; // Re-throw to be caught by runWorker
  }
}

function setupBotEventListeners(botInstance: AgentBot, botUsername: string): void {
  const { bot } = botInstance;

  bot.on('error', (err) => {
    logError('Bot Error:', botUsername, err); // Use updated log function
    safePostMessage({
      type: MessageType.BotError,
      payload: { username: botUsername, error: String(err) },
    });
  });

  bot.on('kicked', (reason, loggedIn) => {
    logError(`Kicked: ${reason} (Logged In: ${loggedIn})`, botUsername); // Use updated log function
    safePostMessage({
      type: MessageType.BotKicked,
      payload: { username: botUsername, reason },
    });
    process.exit(1);
  });

  bot.on('end', (reason) => {
    logInfo(`Disconnected: ${reason}`, botUsername); // Use updated log function
    safePostMessage({
      type: MessageType.BotEnd,
      payload: { username: botUsername, reason },
    });
    process.exit(0);
  });

  logInfo('Critical bot event listeners (error, kicked, end) attached.', botUsername); // Use updated log function
}

function setupStateLogging(botInstance: AgentBot, botUsername: string): void {
  const sharedState = botInstance.sharedState;

  const originalLogMessage = sharedState.logMessage.bind(sharedState);
  const originalLogOpenAIRequest = sharedState.logOpenAIRequest.bind(sharedState);
  const originalLogOpenAIResponse = sharedState.logOpenAIResponse.bind(sharedState);
  const originalLogOpenAIError = sharedState.logOpenAIError.bind(sharedState);

  sharedState.logMessage = (
    role,
    content,
    metadata,
    functionName,
    functionArgs,
    functionResult
  ) => {
    originalLogMessage(
      role,
      content,
      metadata,
      functionName,
      functionArgs,
      functionResult
    );
    const entry = sharedState.conversationLog?.slice(-1)?.[0];
    if (entry) {
      safePostMessage({
        type: MessageType.LogEntry,
        payload: { username: botUsername, entry }, // Use passed username
      });
    }
  };

  // Keep request/response/error logging internal to sharedState if needed,
  // or modify them to post messages if required. Example:
  sharedState.logOpenAIRequest = (endpoint, payload) => {
    originalLogOpenAIRequest(endpoint, payload);
    // Optionally post this info if needed by main thread
  };

  sharedState.logOpenAIResponse = (endpoint: string, response: unknown) => {
    if (typeof response === 'object' && response !== null && 'choices' in response) {
         originalLogOpenAIResponse(endpoint, response as OpenAI.Chat.Completions.ChatCompletion);
    } else {
        logWarn(`[State Logging] logOpenAIResponse received non-ChatCompletion object for endpoint ${endpoint}:`, botUsername, response);
    }
    // Optionally post this info
  };

  sharedState.logOpenAIError = (endpoint, error) => {
    originalLogOpenAIError(endpoint, error);
    // Optionally post this info
  };

  logInfo('SharedAgentState logging overrides configured.', botUsername); // Use updated log function
}

// --- Chat Handling ---
function parseChatMessage(
  message: string,
  botAcronymValue: string | undefined
): ParsedChatMessage {
    const lowerMessage = message.toLowerCase();
    const botPrefix = botAcronymValue ? botAcronymValue.toLowerCase() : undefined;
    const allPrefixLower = ALL_PREFIX.toLowerCase();

    let commandMessage = '';
    let isPrefixed = false;
    let isTargeted = false;

    if (botPrefix && lowerMessage.startsWith(botPrefix)) {
        commandMessage = message.substring(botAcronymValue!.length).trim();
        isPrefixed = true;
        isTargeted = true;
        // Logging handled in setupChatListener
    } else if (lowerMessage.startsWith(allPrefixLower)) {
        commandMessage = message.substring(ALL_PREFIX.length).trim();
        isPrefixed = true;
        isTargeted = true;
        // Logging handled in setupChatListener
    } else {
        commandMessage = message.trim();
        isPrefixed = false;
        // Assuming non-prefixed messages are still targeted for processing/logging
        isTargeted = true;
    }

    return { isTargeted, isPrefixed, command: commandMessage };
}

async function handleTestCommand(
  agent: AgentBot,
  senderUsername: string,
  testCommandArgs: string,
  botUsername: string // Pass botUsername for logging
): Promise<void> {
  logInfo(
    `Handling 'test' command: "${testCommandArgs}" from ${senderUsername}`,
    botUsername // Use updated log function
  );
  try {
    await handleChatTestCommand(agent, senderUsername, testCommandArgs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(
      `Error executing test command "${testCommandArgs}":`,
      botUsername, // Use updated log function
      errorMessage
    );
    agent.bot.chat(
      `[${agent.bot.username}] Error running test command: ${errorMessage}`
    );
  }
}

async function handleGeneralCommand(
  agent: AgentBot,
  senderUsername: string,
  command: string,
  botUsername: string // Pass botUsername for logging
): Promise<void> {
  const { observer, bot } = agent;
   if (!observer) {
      logError("Observer not found in handleGeneralCommand", botUsername); // Use updated log function
      return;
   }

  switch (command.toLowerCase()) {
    case BLOCKS_COMMAND: {
      const result = await observer.getVisibleBlockTypes();
      const blocksStr = result?.BlockTypes
        ? Object.entries(result.BlockTypes)
            .map(
              ([name, { x, y, z }]) =>
                `${name}@(${x.toFixed(0)},${y.toFixed(0)},${z.toFixed(0)})`
            )
            .join(', ') || 'None found'
        : 'N/A (observer error?)';
      bot.chat(`Blocks: ${blocksStr}`);
      break;
    }
    case MOBS_COMMAND: {
      const result = await observer.getVisibleMobs();
      const mobsStr = result?.Mobs
        ? result.Mobs.map(
            (mob) => `${mob.name}(${mob.distance.toFixed(1)}m)`
          ).join(', ') || 'None found'
        : 'N/A (observer error?)';
      bot.chat(`Mobs: ${mobsStr}`);
      break;
    }
    case TOME_COMMAND:
      logInfo(`Executing /tp command for user ${senderUsername}`, botUsername); // Use updated log function
      bot.chat(`/tp ${senderUsername}`);
      break;

    default:
       logInfo(`Ignoring unknown general command: ${command}`, botUsername); // Use updated log function
      break;
  }
}

function setupChatListener(agent: AgentBot, botUsername: string, botAcronym: string | undefined): void {
    assertIsWorkerThread();

    const currentBotAcronym = botAcronym; // Use passed acronym

    if (!currentBotAcronym) {
        logWarn('Bot acronym is missing, prefix matching might not work as expected.', botUsername); // Use updated log function
    }

    const { bot, observer } = agent;
    const currentBotUsername = botUsername; // Use passed username

    if (!observer) {
        logError('Observer not available! Cannot handle chat messages properly.', botUsername); // Use updated log function
        return;
    }
    if (!observer.recentChats || !Array.isArray(observer.recentChats)) {
         logError('observer.recentChats is missing or not an array! Cannot store chat.', botUsername); // Use updated log function
         // Optionally initialize: observer.recentChats = [];
         // Optionally return if fatal
    }

    bot.removeAllListeners('chat');
    logInfo('Attaching chat listener in botWorker...', botUsername); // Use updated log function

    bot.on('chat', async (username: string, message: string) => {
        if (username === currentBotUsername) return; // Ignore self

        const parsed = parseChatMessage(message, currentBotAcronym);

        logInfo(`Parsed chat from ${username}: Targeted=${parsed.isTargeted}, Prefixed=${parsed.isPrefixed}, Command="${parsed.command}"`, botUsername); // Use updated log function

        // Store non-self messages
        if (observer.recentChats && Array.isArray(observer.recentChats)) {
            const formattedMessage = `${username}: ${message}`;
            observer.recentChats.push(formattedMessage);
        }

        // Handle 'test' command
        if (parsed.command.toLowerCase().startsWith(TEST_COMMAND_PREFIX)) {
            const testArgs = parsed.command.substring(TEST_COMMAND_PREFIX.length).trim();
            logInfo(`Handling as TEST command: "${testArgs}"`, botUsername); // Use updated log function
            await handleTestCommand(agent, username, testArgs, botUsername); // Pass botUsername
        }
        // Handle built-in commands
        else if (parsed.isPrefixed || [BLOCKS_COMMAND, MOBS_COMMAND, TOME_COMMAND].includes(parsed.command.toLowerCase())) {
             const lowerCommand = parsed.command.toLowerCase();
             if ([BLOCKS_COMMAND, MOBS_COMMAND, TOME_COMMAND].includes(lowerCommand)) {
                 logInfo(`Handling as BUILT-IN command: "${parsed.command}"`, botUsername); // Use updated log function
                 await handleGeneralCommand(agent, username, parsed.command, botUsername); // Pass botUsername
             } else if (parsed.isPrefixed) {
                 logInfo(`Received prefixed command, but not 'test' or known built-in: "${parsed.command}". Passing to observer.`, botUsername); // Use updated log function
             }
        } else {
            logInfo(`Received non-prefixed, non-test, non-builtin message: "${parsed.command}". Logged in observer.`, botUsername); // Use updated log function
        }
    });
}

// --- Main Thread Message Handling ---
function handleGetState(instance: AgentBot, botUsername: string): void { // Pass username
  try {
    const state: SerializedState = serializeSharedState(instance.sharedState);
    safePostMessage({
      type: MessageType.StateUpdate,
      payload: { username: botUsername, state }, // Use passed username
    });
  } catch (error) {
    logError('Error serializing state:', botUsername, error); // Use updated log function
  }
}

function handleLlmResponse(payload: LlmResponsePayload, requestId: string): void {
  const resolver = llmRequestPromises.get(requestId);
  if (resolver) {
    // Log generically or derive username from requestId if needed
    logInfo(`Received LLM response for request ${requestId} (Type: ${resolver.requestType})`, null); // Generic log
    if (payload.error) {
      resolver.reject(new Error(payload.error));
    } else {
      resolver.resolve(payload.response);
    }
    llmRequestPromises.delete(requestId);
  } else {
    logWarn(`No promise found for LLM response ID ${requestId}`, null); // Generic log
  }
}

async function handleStartGoalPlan(
  instance: AgentBot,
  payload: StartGoalPlanPayload,
  botUsername: string // Pass username
): Promise<void> {
   logInfo(`Received startGoalPlan request: ${payload.goal}`, botUsername); // Use updated log function
   try {
     const tree: StepNode[] = await buildGoalTree( // Make sure buildGoalTree is correctly imported/defined
       payload.goal,
       payload.mode,
       (updatedTree: StepNode[]) => {
         safePostMessage({
           type: MessageType.GoalPlanProgress,
           payload: { username: botUsername, tree: updatedTree }, // Use username
         });
       },
       instance.sharedState
     );
     safePostMessage({
       type: MessageType.GoalPlanComplete,
       payload: { username: botUsername, tree }, // Use username
     });
   } catch (error: unknown) {
     const errorMessage =
       error instanceof Error ? error.message : 'Unknown goal planning error';
     logError('Error during goal planning:', botUsername, errorMessage); // Use updated log function
     safePostMessage({
       type: MessageType.GoalPlanError,
       payload: { username: botUsername, error: errorMessage }, // Use username
     });
   }
}

function setupMessageListener(botUsername: string): void { // Pass username and acronym
  if (!parentPort) {
    throw new Error('ParentPort is null');
  }
  assertIsWorkerThread();
  parentPort.on('message', (message: WorkerMessage) => {
    (async () => {
      if (!agentBotInstance) {
        logWarn(`Received message type ${message.type} before initialization.`, botUsername); // Use updated log function
        return;
      }

      // Pass botUsername and botAcronym down to handlers if they need it
      switch (message.type) {
        case MessageType.GetState:
          handleGetState(agentBotInstance, botUsername); // Pass username
          break;
        case MessageType.LlmResponse:
          handleLlmResponse(message.payload, message.requestId);
          break;
        case MessageType.StartGoalPlan:
           if (message.payload) {
               await handleStartGoalPlan(agentBotInstance, message.payload, botUsername); // Pass username
           } else {
               logWarn(`Received ${message.type} message without payload.`, botUsername); // Use updated log function
           }
          break;
        // ... other cases ...
        default:
          logWarn(`Received unhandled message type: ${message.type}`, botUsername); // Use updated log function
      }
    })().catch(err => {
        logError('Error in message handler:', botUsername, err); // Use updated log function
    });
  });
  logInfo('Main thread message listener attached.', botUsername); // Use updated log function
}

// --- LLM Proxy ---
// Define overloads first
export function proxyLLMRequest(
    type: 'chat',
    data: ChatRequestData,
    botUsername: string // Added botUsername parameter
): Promise<OpenAI.Chat.Completions.ChatCompletion>;

export function proxyLLMRequest(
    type: 'json',
    data: JsonRequestData,
    botUsername: string // Added botUsername parameter
): Promise<ParsedJsonResponse>;

// Implementation
export function proxyLLMRequest(
    type: 'chat' | 'json',
    data: ChatRequestData | JsonRequestData,
    botUsername: string // Added botUsername parameter
): Promise<unknown> {
  assertIsWorkerThread();

  // Use the passed botUsername for the requestId
  const requestId = `${botUsername}_${llmRequestIdCounter++}`;
  logInfo(`Proxying LLM Request ${requestId} (Type: ${type})`, botUsername); // Use updated log function

  let messageToSend: WorkerMessage;
  if (type === 'chat') {
      messageToSend = {
          type: MessageType.LlmRequest,
          requestId: requestId,
          payload: { type: 'chat', data: data as ChatRequestData }
      };
  } else { // type === 'json'
      messageToSend = {
          type: MessageType.LlmRequest,
          requestId: requestId,
          payload: { type: 'json', data: data as JsonRequestData }
      };
  }

  const promise = new Promise<unknown>((resolve, reject) => {
    llmRequestPromises.set(requestId, { resolve, reject, requestType: type });
    safePostMessage(messageToSend);
  });

  return promise;
}

// --- Worker Entry Point ---
async function runWorker(): Promise<void> {
  assertIsWorkerThread();

  // MOVED ACCESS HERE:
  const botOptions = workerData as BotOptions;

  // Add null/undefined check for workerData
  if (!botOptions) {
      logError('Critical error: workerData is null or undefined inside worker.', null); // Log generically
      safePostMessage({
          type: MessageType.InitializationError,
          payload: { username: 'unknown', error: 'workerData is missing or invalid' },
      });
      process.exit(1);
      return; // Keep TS happy
  }

   // Check if username exists and is valid
   if (typeof botOptions.username !== 'string' || !botOptions.username) {
        logError('Critical error: botOptions.username is missing or invalid inside worker.', null); // Log generically
        safePostMessage({
            type: MessageType.InitializationError,
            payload: { username: 'unknown', error: 'botOptions.username is missing or invalid' },
        });
        process.exit(1);
        return; // Keep TS happy
   }

  // Now safely access properties
  const botUsername: string = botOptions.username;
  const botAcronym: string | undefined = botOptions.acronym;
  // --- End moved access ---

  // Now we have botUsername, use it for logging
  logInfo(`Initializing Worker... Username: '${botUsername}', Acronym: '${botAcronym || '(none)'}'`, botUsername);

  try {
    // Pass the locally retrieved botOptions
    agentBotInstance = await initializeBotInstance(botOptions);

    // Pass username/acronym to setup functions that need them
    setupBotEventListeners(agentBotInstance, botUsername);
    setupStateLogging(agentBotInstance, botUsername);
    setupChatListener(agentBotInstance, botUsername, botAcronym);
    setupMessageListener(botUsername); // Pass necessary context

    safePostMessage({
      type: MessageType.Initialized,
      payload: { username: botUsername }, // Use local botUsername
    });
    logInfo('Initialization complete. Worker is ready.', botUsername);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Use botUsername if available, otherwise 'unknown'
    const usernameForError = botUsername || 'unknown';
    logError(`Worker initialization failed: ${errorMessage}`, usernameForError);
    safePostMessage({
      type: MessageType.InitializationError,
      payload: { username: usernameForError, error: errorMessage },
    });
    process.exit(1);
  }
}

if (!isMainThread) {
  runWorker().catch((error) => {
    // Log generically as username might not be available if error is early
    logError('Unhandled error during worker execution:', null, error);
    process.exit(1); // Ensure exit on unhandled error in worker context
  });
}