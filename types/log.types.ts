// Create a new file: types/log-types.ts
export interface LogEntry {
    timestamp: string;
    role: "user" | "assistant" | "function" | "system" | "api_request" | "api_response" | "api_error" | "memory";
    content: string;
    metadata?: Record<string, any>; 
    endpoint?: string;
    payload?: any;
    response?: any;
    error?: any;
    functionName?: string;
    arguments?: any;
    result?: string;
  }