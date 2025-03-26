// Create a new file: types/log-types.ts
export interface LogEntry {
    timestamp: string;
    // More specific roles for clarity
    role: "user" | "assistant" | "function" | "system" | "api_request" | "api_response" | "api_error" | "memory";
    content: string; // Main message content or description
    metadata?: Record<string, any>; // Flexible metadata for extra details
    // Specific fields for API interactions or function calls
    endpoint?: string;
    payload?: any;
    response?: any;
    error?: any;
    functionName?: string;
    arguments?: any;
    result?: string;
  }