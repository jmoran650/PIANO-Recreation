import OpenAI from 'openai';
// Keep the standard JSONSchema type for potential other uses or as a base
import { type JSONSchema as StandardJSONSchema } from 'openai/lib/jsonschema';

// Define the specific schema type required by the OpenAI API call, including 'name'
export interface NamedJSONSchema extends StandardJSONSchema {
  name: string;
  // You might need to refine this further based on exact OpenAI requirements,
  // but 'name' is the one flagged by the error.
  // StandardJSONSchema already includes properties like 'type', 'properties', etc.
}


// Define a type for the meta object in the logger for better type safety
type LogMeta = Record<string, unknown>;

interface LLMPendingRequest {
  prompt: string;
  resolve: (value: string) => void;
  reject: (error: Error) => void; // Ensure reject handles Error objects
}

const llmQueue: LLMPendingRequest[] = [];
const RATE_LIMIT_INTERVAL = 1000;
const MAX_LENGTH = 100000;

let totalLLMRequests = 0;
const llmRequestTimestamps: number[] = [];
let totalInputChars = 0;
let totalOutputChars = 0;

let llmEnabled = true;

// We'll store an optional logger callback that can funnel logs into sharedState
let logger: null | ((type: string, msg: string, meta?: LogMeta) => void) = null;

/**
 * Provide a logging function that we can call whenever we do an OpenAI request or response.
 */
export function setLLMLogger(
  logFn: (type: string, message: string, meta?: LogMeta) => void
): void {
  logger = logFn;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure OPENAI_API_KEY is set in your environment
});

// --- actualLLMCall remains the same ---
async function actualLLMCall(prompt: string): Promise<string> {
  if (logger) {
    logger(
      'system',
      'OpenAI Request (callLLM)',
      { endpoint: 'chat.completions.create', prompt }
    );
  }
  let responseContent = '';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    const content = completion.choices?.[0]?.message?.content;
    if (content) {
      responseContent = content;
      if (logger) {
        logger('system', 'OpenAI Response (callLLM)', {
          endpoint: 'chat.completions.create',
          response: completion,
        });
      }
      if (responseContent.length > MAX_LENGTH) {
        throw new Error(
          `LLM response length (${responseContent.length}) exceeds maximum allowed (${MAX_LENGTH}).`
        );
      }
      totalOutputChars += responseContent.length;
      return responseContent;
    }
    throw new Error('No valid response content from OpenAI API.');
  } catch (error) {
    if (logger) {
      logger('system', 'OpenAI Error (callLLM)', {
        endpoint: 'chat.completions.create',
        error: String(error),
      });
    }
    throw error;
  }
}


// This internal function returns unknown because its parsed type depends
// on the schema provided by the caller. The public wrapper will handle casting.
async function actualLLMCallJsonSchema(
  systemMsg: string,
  userMsg: string,
  // Use the new specific NamedJSONSchema type
  jsonSchema: NamedJSONSchema
): Promise<{ parsed: unknown }> { // Return unknown, casting is done in the caller
  if (logger) {
    logger('system', 'OpenAI Request (callLLMJsonSchema)', {
      endpoint: 'chat.completions.create (json_schema)',
      systemMsg,
      userMsg,
      schema: jsonSchema,
    });
  }

  let rawContent: string | null = '';
  try {
    const completion = await openai.chat.completions.create({ // Line 129 where error occurred
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      response_format: {
        type: 'json_schema',
        // Pass the schema which now conforms to the expected type (has 'name')
        json_schema: jsonSchema,
      },
    });

    rawContent = completion.choices?.[0]?.message?.content ?? null;

    if (!rawContent) {
      throw new Error('Model returned empty response.');
    }

    if (logger) {
      logger('system', 'OpenAI Response (callLLMJsonSchema)', {
        endpoint: 'chat.completions.create (json_schema)',
        response: completion,
      });
    }

    let parsedObj: unknown;
    try {
      parsedObj = JSON.parse(rawContent);
    } catch (parseError) {
      throw new Error(
        `Failed to parse the LLM JSON response. Raw output:\n${rawContent}\n\nError: ${String(
          parseError
        )}`
      );
    }
    return { parsed: parsedObj };
  } catch (error) {
    if (logger) {
      logger('system', 'OpenAI Error (callLLMJsonSchema)', {
        endpoint: 'chat.completions.create (json_schema)',
        error: String(error),
      });
    }
    throw error;
  }
}

// Process the queue
// FIX: Address @typescript-eslint/no-misused-promises
setInterval(() => { // Outer function is sync (returns void)
  // Immediately invoked async function expression (IIAFE)
  // Use 'void' to explicitly ignore the returned promise from the IIAFE
  void (async () => { // Line 176 where error occurred
    if (llmQueue.length > 0) {
      const request = llmQueue.shift()!;
      try {
        const response = await actualLLMCall(request.prompt);
        request.resolve(response);
      } catch (err) {
        if (err instanceof Error) {
          request.reject(err);
        } else {
          request.reject(new Error(String(err)));
        }
      }
    }
  })(); // Invoke the async function
}, RATE_LIMIT_INTERVAL);


// --- callLLM remains the same ---
export async function callLLM(prompt: string): Promise<string> {
  if (!llmEnabled) {
    return Promise.reject(new Error('LLM requests are disabled.'));
  }
  if (prompt.length > MAX_LENGTH) {
    return Promise.reject(
      new Error(
        `Prompt length (${prompt.length}) exceeds maximum allowed length of ${MAX_LENGTH} characters.`
      )
    );
  }
  totalLLMRequests++;
  llmRequestTimestamps.push(Date.now());
  totalInputChars += prompt.length;

  return new Promise<string>((resolve, reject) => {
    llmQueue.push({ prompt, resolve, reject });
  });
}


// Use a generic type T for the expected parsed result structure
export async function callLLMJsonSchema<T>(
  systemMsg: string,
  userMsg: string,
  // Use the new specific NamedJSONSchema type
  jsonSchema: NamedJSONSchema
): Promise<{ parsed: T }> {
  if (!llmEnabled) {
    return Promise.reject(new Error('LLM requests are disabled.'));
  }
  const combined = systemMsg + '\n' + userMsg;
  if (combined.length > MAX_LENGTH) {
    return Promise.reject(
      new Error(
        `Prompt length (${combined.length}) exceeds maximum allowed length of ${MAX_LENGTH}.`
      )
    );
  }
  totalLLMRequests++;
  llmRequestTimestamps.push(Date.now());
  totalInputChars += combined.length;

  // FIX: Remove useless try-catch (eslint: no-useless-catch) - Error occurred around Line 242
  // Errors from actualLLMCallJsonSchema will now propagate directly.
  const result = await actualLLMCallJsonSchema(systemMsg, userMsg, jsonSchema);

  const parsed = result.parsed as T;

  if (parsed !== null && parsed !== undefined) {
      try {
          const outStr = JSON.stringify(parsed);
          totalOutputChars += outStr.length;
      } catch (stringifyError) {
          console.error("Failed to stringify LLM JSON response for metrics:", stringifyError);
           if (logger) {
              logger('system', 'LLM Metrics Stringify Error', { error: String(stringifyError) });
           }
      }
  }
  return { parsed: parsed };
}

// --- getLLMMetrics, setLLMEnabled, toggleLLMEnabled remain the same ---
interface LLMMetrics {
  totalRequests: number;
  requestsLast10Min: number;
  totalInputChars: number;
  totalOutputChars: number;
}

export function getLLMMetrics(): LLMMetrics {
  const now = Date.now();
  const tenMinutesAgo = now - 600000;
  const recentTimestamps = llmRequestTimestamps.filter((ts) => ts >= tenMinutesAgo);
  return {
    totalRequests: totalLLMRequests,
    requestsLast10Min: recentTimestamps.length,
    totalInputChars,
    totalOutputChars,
  };
}

export function setLLMEnabled(enabled: boolean): void {
  llmEnabled = enabled;
}

export function toggleLLMEnabled(): boolean {
  llmEnabled = !llmEnabled;
  return llmEnabled;
}