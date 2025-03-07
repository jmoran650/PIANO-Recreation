// utils/llmWrapper.ts

import OpenAI from "openai";

interface LLMPendingRequest {
  prompt: string;
  resolve: (value: string) => void;
  reject: (error: any) => void;
}

// A simple in-memory queue for pending LLM requests.
const llmQueue: LLMPendingRequest[] = [];

// Define your rate limit interval in milliseconds (e.g., 1000 ms = 1 call per second).
const RATE_LIMIT_INTERVAL = 1000;

// Maximum allowed length for prompts/responses.
const MAX_LENGTH = 100000;

// Metrics: total requests made, timestamps of each request (in ms), and character counters.
let totalLLMRequests = 0;
const llmRequestTimestamps: number[] = [];

// Running totals for input and output characters.
let totalInputChars = 0;
let totalOutputChars = 0;

// Global flag to enable/disable LLM requests.
let llmEnabled = true;

// Set up the OpenAI client using the API key from process.env.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * actualLLMCall:
 * Uses the OpenAI API to generate a completion for the given prompt, returning plain text.
 * This is still used by callLLM() and leaves the formatting entirely up to the model's response.
 */
async function actualLLMCall(prompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini", // you may change to any supported model as needed.
    messages: [{ role: "user", content: prompt }],
  });
  if (
    completion.choices &&
    completion.choices.length > 0 &&
    completion.choices[0].message &&
    completion.choices[0].message.content
  ) {
    const output = completion.choices[0].message.content;
    if (output.length > MAX_LENGTH) {
      throw new Error(
        `LLM response length (${output.length}) exceeds maximum allowed (${MAX_LENGTH}).`
      );
    }
    totalOutputChars += output.length;
    return output;
  }
  throw new Error("No valid response from OpenAI API.");
}

/**
 * actualLLMCallJsonSchema:
 * Uses the OpenAI API to generate a completion for the given system+user instructions,
 * but *attempts* to force the model to adhere to a JSON Schema. 
 * 
 * In practice, the official OpenAI Node library does NOT yet have a native `response_format` 
 * or `json_schema` parameter. If you are using a custom or experimental version, or a 
 * plugin-based approach, you'll need to ensure that the model's output is valid JSON 
 * in the .message.content field. 
 */
async function actualLLMCallJsonSchema(
  systemMsg: string,
  userMsg: string,
  jsonSchema: any
): Promise<{ parsed: any }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ],
    // This is a placeholder. In official OpenAI usage, you'd typically instruct
    // the model to output valid JSON in the 'system' or 'user' message. 
    // The "response_format" key here is not standard in the openai library.
    response_format: {
      type: "json_schema",
      json_schema: jsonSchema,
    },
  });

  if (!completion.choices || !completion.choices[0].message) {
    throw new Error("No valid structured response from OpenAI API.");
  }

  const rawContent = completion.choices[0].message.content;
  if (!rawContent) {
    throw new Error("Model returned empty response.");
  }

  // FIX: Parse the string into JSON so that result.parsed will be an object.
  let parsedObj: any;
  try {
    parsedObj = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(
      `Failed to parse the LLM JSON response. Raw output:\n${rawContent}\n\nError: ${err}`
    );
  }

  // Return an object with a 'parsed' key.
  return { parsed: parsedObj };
}

/**
 * Queue-based approach for plain text calls.
 */
setInterval(async () => {
  if (llmQueue.length > 0) {
    const request = llmQueue.shift();
    if (request) {
      try {
        const response = await actualLLMCall(request.prompt);
        request.resolve(response);
      } catch (err) {
        request.reject(err);
      }
    }
  }
}, RATE_LIMIT_INTERVAL);

/**
 * callLLM:
 * A global function to wrap LLM API calls for *plain text* usage.
 * Enqueues the request and returns a promise once the API call is processed.
 */
export async function callLLM(prompt: string): Promise<string> {
  if (!llmEnabled) {
    return Promise.reject(new Error("LLM requests are disabled."));
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

  return new Promise((resolve, reject) => {
    llmQueue.push({ prompt, resolve, reject });
  });
}

/**
 * callLLMJsonSchema:
 * For tasks where we *require* valid JSON adhering to a known schema.
 * This bypasses the queue-based approach so we can do a single call with response_format,
 * or more commonly (in official usage) uses a chain-of-thought prompt that 
 * instructs the model to produce valid JSON.
 *
 * If the model refuses or fails to produce valid JSON, we throw an error.
 *
 * Returns:
 *   { parsed: T | null } on success
 *   (Potentially add 'refusal' property if you want to handle refusal states.)
 */
export async function callLLMJsonSchema<T>(
  systemMsg: string,
  userMsg: string,
  jsonSchema: any
): Promise<{ parsed: T | null }> {
  if (!llmEnabled) {
    return Promise.reject(new Error("LLM requests are disabled."));
  }

  const combined = systemMsg + "\n" + userMsg;
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

  try {
    const { parsed } = await actualLLMCallJsonSchema(systemMsg, userMsg, jsonSchema);
    if (parsed) {
      const outStr = JSON.stringify(parsed);
      totalOutputChars += outStr.length;
    }
    return { parsed: parsed as T };
  } catch (err) {
    // If the model's output can't be parsed or is invalid, we throw.
    throw err;
  }
}

/**
 * getLLMMetrics:
 * Returns an object containing LLM usage metrics.
 */
export function getLLMMetrics(): {
  totalRequests: number;
  requestsLast10Min: number;
  totalInputChars: number;
  totalOutputChars: number;
} {
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

/**
 * setLLMEnabled and toggleLLMEnabled:
 * Quick ways to enable/disable the LLM calls at runtime.
 */
export function setLLMEnabled(enabled: boolean): void {
  llmEnabled = enabled;
}

export function toggleLLMEnabled(): boolean {
  llmEnabled = !llmEnabled;
  return llmEnabled;
}