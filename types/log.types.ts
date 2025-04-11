export interface LogEntry {
  timestamp: string;
  role:
    | 'user'
    | 'assistant'
    | 'function'
    | 'system'
    | 'api_request'
    | 'api_response'
    | 'api_error'
    | 'memory';
  content: string;

  /** Flexible metadata. Using 'unknown' is safer than 'any' and requires type checks/assertions on use. */
  metadata?: Record<string, unknown>;

  /** API endpoint relevant to the log entry (e.g., 'chat.completions.create'). */
  endpoint?: string;

  /** Data sent in an API request (role='api_request'). 'unknown' requires type checks before use. */
  payload?: unknown;

  /** Data received in an API response (role='api_response'). 'unknown' requires type checks before use. */
  response?: unknown;

  /** Error details (role='api_error' or 'function' on error). 'unknown' requires type checks before use. */
  error?: unknown;

  /** Name of the function called (role='function'). */
  functionName?: string;

  /** Arguments passed to the function (role='function'). 'unknown' requires type checks before use. */
  arguments?: unknown;

  /** Result returned by the function (role='function'). Assuming string for simplicity, could be 'unknown'. */
  result?: string;
}