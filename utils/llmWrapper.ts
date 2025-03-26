import OpenAI from "openai";

interface LLMPendingRequest {
  prompt: string;
  resolve: (value: string) => void;
  reject: (error: any) => void;
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
let logger: null | ((type: string, msg: string, meta?: any) => void) = null;

/**
 * Provide a logging function that we can call whenever we do an OpenAI request or response.
 * For example:
 *   setLLMLogger((role, content, metadata) => {
 *     sharedState.logMessage("system", content, metadata);
 *   });
 */
export function setLLMLogger(
  logFn: (type: string, message: string, meta?: any) => void
) {
  logger = logFn;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function actualLLMCall(prompt: string): Promise<string> {
  // Log outgoing request (if logger is available)
  if (logger) {
    logger(
      "system",
      "OpenAI Request (callLLM)",
      { endpoint: "chat.completions.create", prompt }
    );
  }

  let responseContent = "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    if (
      completion.choices &&
      completion.choices.length > 0 &&
      completion.choices[0].message &&
      completion.choices[0].message.content
    ) {
      responseContent = completion.choices[0].message.content;

      // Log successful response
      if (logger) {
        logger("system", "OpenAI Response (callLLM)", {
          endpoint: "chat.completions.create",
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
    throw new Error("No valid response from OpenAI API.");
  } catch (error) {
    // Log the error
    if (logger) {
      logger("system", "OpenAI Error (callLLM)", {
        endpoint: "chat.completions.create",
        error: String(error),
      });
    }
    throw error;
  }
}

async function actualLLMCallJsonSchema(
  systemMsg: string,
  userMsg: string,
  jsonSchema: any
): Promise<{ parsed: any }> {
  // Log outgoing request
  if (logger) {
    logger("system", "OpenAI Request (callLLMJsonSchema)", {
      endpoint: "chat.completions.create (json_schema)",
      systemMsg,
      userMsg,
      schema: jsonSchema,
    });
  }

  let rawContent = "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema,
      },
    });

    if (!completion.choices || !completion.choices[0].message.content) {
      throw new Error("No valid structured response from OpenAI API.");
    }

    rawContent = completion.choices[0].message.content;
    if (!rawContent) {
      throw new Error("Model returned empty response.");
    }

    // Log successful response
    if (logger) {
      logger("system", "OpenAI Response (callLLMJsonSchema)", {
        endpoint: "chat.completions.create (json_schema)",
        response: completion,
      });
    }

    let parsedObj: any;
    try {
      parsedObj = JSON.parse(rawContent);
    } catch (err) {
      throw new Error(
        `Failed to parse the LLM JSON response. Raw output:\n${rawContent}\n\nError: ${err}`
      );
    }
    return { parsed: parsedObj };
  } catch (error) {
    // Log error
    if (logger) {
      logger("system", "OpenAI Error (callLLMJsonSchema)", {
        endpoint: "chat.completions.create (json_schema)",
        error: String(error),
      });
    }
    throw error;
  }
}

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
    throw err;
  }
}

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

export function setLLMEnabled(enabled: boolean): void {
  llmEnabled = enabled;
}

export function toggleLLMEnabled(): boolean {
  llmEnabled = !llmEnabled;
  return llmEnabled;
}