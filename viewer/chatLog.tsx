import React from "react";
import { LogEntry } from "../types/log.types"; // Assuming LogEntry provides role, timestamp, content, metadata

// Define more specific types for metadata content (adjust based on actual data structures)

interface ApiResponseData {
  id?: string;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    [key: string]: unknown; // Allow other properties if needed
  };
  choices?: Array<{
    finish_reason?: string;
    message?: {
      tool_calls?: Array<Record<string, unknown>>; // Define tool call structure if known
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  // Allow other potential fields
  [key: string]: unknown;
}


// Refine LogEntry if possible, otherwise assume metadata is Record<string, unknown> | undefined
// Example refinement (ideal scenario):
// interface LogEntryBase { timestamp?: string | number; content?: string; }
// type LogEntry = LogEntryBase & (
//   | { role: 'user' | 'system' | 'assistant'; metadata?: Record<string, unknown> } // Keep general metadata optional
//   | { role: 'api_request'; metadata: { payload: ApiRequestPayload } }
//   | { role: 'api_response'; metadata: { response: ApiResponseData } }
//   | { role: 'api_error'; metadata: { error: ApiErrorData } }
//   | { role: 'function'; metadata: FunctionMetadata }
//   | { role: 'memory'; metadata: Record<string, unknown> }
// );
// If LogEntry cannot be changed, we'll work with Record<string, unknown> | undefined

interface ChatLogProps {
  conversationLog?: LogEntry[]; // Use LogEntry[]
}

// Helper function to safely check if a value is an object and has a specific property
function hasProperty<K extends string>(
    obj: unknown,
    key: K
): obj is { [key in K]: unknown } {
    return typeof obj === 'object' && obj !== null && key in obj;
}

// Helper function to safely check if a value is a non-null object
function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}


// Helper function to render metadata nicely
const renderMetadata = (metadata: Record<string, unknown> | undefined, role: LogEntry['role']) => {
    if (!metadata) {
        return null;
    }

    let specificMetadata: Record<string, unknown> = {};

    // Extract specific fields based on role for cleaner display using type guards
    if (role === 'api_request' && hasProperty(metadata, 'payload')) {
        specificMetadata = { RequestPayload: metadata.payload };
    } else if (role === 'api_response' && hasProperty(metadata, 'response') && isObject(metadata.response)) {
        // Safely access properties of response
        const responseData = metadata.response as ApiResponseData; // Use type assertion after check or access safely
        const simpleResponse: Partial<ApiResponseData> = {
            id: responseData.id,
            model: responseData.model,
            usage: responseData.usage,
            finish_reason: responseData.choices?.[0]?.finish_reason,
            tool_calls: responseData.choices?.[0]?.message?.tool_calls,
        };
         // Clean up undefined values from simpleResponse before assigning
        Object.keys(simpleResponse).forEach(key => {
            if (simpleResponse[key as keyof typeof simpleResponse] === undefined) {
                delete simpleResponse[key as keyof typeof simpleResponse];
            }
        });
        specificMetadata = { ResponseDetails: simpleResponse };

    } else if (role === 'api_error' && hasProperty(metadata, 'error')) {
        specificMetadata = { ErrorDetails: metadata.error };
    } else if (role === 'function') {
        // Assume metadata *might* have arguments or result based on FunctionMetadata type
      
        const args = hasProperty(metadata, 'arguments') ? metadata.arguments : undefined;
        const result = hasProperty(metadata, 'result') ? metadata.result : undefined;
        const name = hasProperty(metadata, 'name') ? metadata.name : undefined;

         const funcDetails: Record<string, unknown> = {};
         if (name !== undefined) funcDetails.FunctionName = name;
         if (args !== undefined) funcDetails.Arguments = args;
         if (result !== undefined) funcDetails.Result = result;

         if (Object.keys(funcDetails).length > 0) {
             specificMetadata = funcDetails;
         } else {
             // Fallback: show raw metadata if specific keys aren't found
             specificMetadata = metadata;
         }

    } else if (role === 'memory') {
         specificMetadata = metadata; // Show all metadata for memory
    } else {
        // Fallback for other roles or generic metadata - show all
        specificMetadata = metadata;
    }

    // Filter out empty objects/arrays before rendering
    const filteredMetadata = Object.entries(specificMetadata).reduce((acc, [key, value]) => {
        const isEmptyObject = isObject(value) && Object.keys(value).length === 0;
        const isEmptyArray = Array.isArray(value) && value.length === 0;
        if (!isEmptyObject && !isEmptyArray && value !== undefined && value !== null) {
            // Ensure the accumulator knows its type
            acc[key] = value;
        }
        return acc;
    }, {} as Record<string, unknown>); // Type the initial value of the accumulator


    if (Object.keys(filteredMetadata).length === 0) {
        return null; // Don't render empty metadata sections
    }

  return (
    <div className="chat-metadata">
      <strong>Details:</strong>
      <ul>
        {/* Ensure 'value' is treated as 'unknown' and stringified */}
        {Object.entries(filteredMetadata).map(([key, value]) => (
          <li key={key}>
            <strong>{key}:</strong> {/* Inner keys (within JSON) are styled by <pre> styles */}
            <pre>{JSON.stringify(value, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
};


const ChatLog: React.FC<ChatLogProps> = ({ conversationLog }) => {
  return (
    <div className="chat-log-container">
      <h2>Conversation Log</h2>
      <div className="chat-log-content">
        {conversationLog && conversationLog.length > 0 ? (
          conversationLog.map((entry, index) => {
            // Destructure safely, assuming LogEntry structure
            // If LogEntry type definition isn't strict, defaults might be needed
            const { role, timestamp, content = '', metadata } = entry; // Provide default for content

            // Format timestamp (ensure timestamp is string or number)
            const formattedTimestamp = timestamp
                ? new Date(timestamp).toLocaleTimeString()
                : "";

            return (
              <div className={`chat-entry chat-entry-${role}`} key={index}>
                <div className="chat-entry-header">
                  <div className="chat-role-container">
                    <span className={`chat-role ${role.toLowerCase()}`}>
                      {role.toUpperCase()}
                    </span>
                  </div>
                  <div className="chat-timestamp-container">
                    <span className="chat-timestamp">{formattedTimestamp}</span>
                  </div>
                </div>
                <div className="chat-entry-body">
                  <div className="chat-content">
                     {/* Render content safely */}
                    <p>{typeof content === 'string' ? content : JSON.stringify(content)}</p>
                  </div>
                  {/* Render metadata using the helper */}
                  {/* Ensure metadata is passed correctly (it can be undefined) */}
                  {renderMetadata(metadata, role)}
                </div>
              </div>
            );
          })
        ) : (
          <div className="chat-entry">Loading...</div>
        )}
      </div>
      {/* Styles remain the same */}
      <style>{`
        .chat-log-container {
          font-family: Arial, sans-serif;
          color: #333;
          box-sizing: border-box;
          /* height: 100%; */ /* Removed fixed height */
          margin: 0;
          padding: 0;
        }
        .chat-log-container h2 {
          margin: 0 0 12px 0;
          font-size: 1.2em;
        }
        .chat-log-content {
          overflow-y: auto;
          border: 1px solid #ddd;
          padding: 8px; /* Reduced padding */
          border-radius: 8px;
          background-color: #fafafa;
          max-height: 350px; /* Limit height */
        }
        .chat-entry {
          border-bottom: 1px solid #eee;
          padding: 8px 0; /* Reduced padding */
          margin-bottom: 8px; /* Reduced margin */
        }
        .chat-entry:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }
        .chat-entry-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px; /* Reduced margin */
        }
        .chat-role-container {
          flex: 0 0 auto;
        }
        .chat-timestamp-container {
          flex: 0 0 auto;
          font-size: 0.75em; /* Smaller timestamp */
          color: #999;
        }
        .chat-role {
          font-weight: bold;
          padding: 2px 6px; /* Smaller padding */
          border-radius: 4px;
          font-size: 0.8em; /* Smaller role text */
        }
        .chat-role.user { background-color: #e1f5fe; color: #01579b; }
        .chat-role.assistant { background-color: #e8f5e9; color: #1b5e20; }
        .chat-role.function { background-color: #fffde7; color: #f57f17; }
        .chat-role.system { background-color: #f5f5f5; color: #616161; }
        .chat-role.memory { background-color: #f3e5f5; color: #4a148c; }
        .chat-role.api_request { background-color: #ede7f6; color: #311b92; }
        .chat-role.api_response { background-color: #e0f2f1; color: #004d40; }
        .chat-role.api_error { background-color: #ffebee; color: #b71c1c; }

        .chat-entry-body {
          padding-left: 8px;
        }
        .chat-content p {
          margin: 4px 0 0 0;
          white-space: pre-wrap;
          font-size: 0.9em; /* Slightly smaller content text */
        }
        .chat-metadata {
          margin-top: 6px; /* Reduced margin */
          font-size: 0.8em; /* Smaller metadata text */
          background-color: #f0f0f0;
          padding: 6px; /* Reduced padding */
          border-radius: 4px;
          max-height: 150px; /* Limit metadata height */
          overflow-y: auto;
        }
        .chat-metadata strong { /* Make top-level key bold */
            font-weight: bold;
        }
        .chat-metadata ul {
          margin: 4px 0 0 0;
          padding-left: 16px;
        }
        .chat-metadata li {
          margin-bottom: 4px;
        }
         .chat-metadata li strong { /* Make inner keys normal weight */
            font-weight: normal; /* This selects the <strong> inside <li> */
            color: #555; /* Dim inner keys slightly */
         }
        .chat-metadata pre { /* Style nested JSON */
            background: #e8e8e8;
            padding: 4px;
            margin-top: 2px;
            border-radius: 3px;
            white-space: pre-wrap;
            word-break: break-all;
            font-size: 0.9em;
        }
      `}</style>
    </div>
  );
};

export default ChatLog;