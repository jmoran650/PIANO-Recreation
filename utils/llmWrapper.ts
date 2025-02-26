// llmWrapper.ts

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

/**
 * setLLMEnabled
 *
 * A function to enable or disable LLM requests.
 *
 * @param enabled boolean - if false, further callLLM requests will be rejected.
 */
export function setLLMEnabled(enabled: boolean): void {
  llmEnabled = enabled;
}

/**
 * toggleLLMEnabled
 *
 * Toggles the LLM enabled flag and returns the new state.
 */
export function toggleLLMEnabled(): boolean {
  llmEnabled = !llmEnabled;
  return llmEnabled;
}

/**
 * actualLLMCall
 *
 * This function should contain the real API call to your LLM provider.
 * For demonstration purposes, it simulates an API call with a delay.
 *
 * @param prompt The prompt string to send to the LLM.
 * @returns A promise resolving to a response string.
 */
async function actualLLMCall(prompt: string): Promise<string> {
  // TODO: Replace this dummy implementation with your actual API call (e.g., using fetch or axios).
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Simulated response for prompt: "${prompt}"`);
    }, 500); // Simulate a 500ms API call latency
  });
}

/**
 * Process the LLM queue at a fixed interval.
 * This function dequeues one request per RATE_LIMIT_INTERVAL and calls the LLM API.
 */
setInterval(async () => {
  if (llmQueue.length > 0) {
    const request = llmQueue.shift();
    if (request) {
      try {
        const response = await actualLLMCall(request.prompt);
        // Check output length and throw a non-blocking error if over limit.
        if (response.length > MAX_LENGTH) {
          request.reject(
            new Error(
              `LLM response length (${response.length}) exceeds maximum allowed (${MAX_LENGTH}).`
            )
          );
        } else {
          // Update the running total for output characters.
          totalOutputChars += response.length;
          request.resolve(response);
        }
      } catch (err) {
        request.reject(err);
      }
    }
  }
}, RATE_LIMIT_INTERVAL);

/**
 * callLLM
 *
 * A global function to wrap LLM API calls. It enqueues the request and returns
 * a promise that resolves once the API call is processed.
 *
 * @param prompt The prompt string for the LLM.
 * @returns A promise resolving to the LLM response.
 */
export async function callLLM(prompt: string): Promise<string> {
  // Check if LLM requests are disabled.
  if (!llmEnabled) {
    return Promise.reject(new Error("LLM requests are disabled."));
  }
  // Check prompt length first.
  if (prompt.length > MAX_LENGTH) {
    return Promise.reject(
      new Error(
        `Prompt length (${prompt.length}) exceeds maximum allowed length of ${MAX_LENGTH} characters.`
      )
    );
  }
  // Record metrics.
  totalLLMRequests++;
  llmRequestTimestamps.push(Date.now());
  totalInputChars += prompt.length;

  return new Promise((resolve, reject) => {
    llmQueue.push({ prompt, resolve, reject });
  });
}

/**
 * getLLMMetrics
 *
 * Returns an object containing LLM metrics:
 * - totalRequests: The total number of LLM requests made.
 * - requestsLast10Min: The number of requests made in the last 10 minutes.
 * - totalInputChars: The running total of input characters.
 * - totalOutputChars: The running total of output characters.
 */
export function getLLMMetrics(): {
  totalRequests: number;
  requestsLast10Min: number;
  totalInputChars: number;
  totalOutputChars: number;
} {
  const now = Date.now();
  // 10 minutes = 600000 ms
  const tenMinutesAgo = now - 600000;
  // Filter out timestamps older than 10 minutes.
  const recentTimestamps = llmRequestTimestamps.filter((ts) => ts >= tenMinutesAgo);
  return {
    totalRequests: totalLLMRequests,
    requestsLast10Min: recentTimestamps.length,
    totalInputChars,
    totalOutputChars,
  };
}