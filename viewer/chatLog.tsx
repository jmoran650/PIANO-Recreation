import React from "react";
import { LogEntry } from "../types/log.types"; // Import the interface

interface ChatLogProps {
  conversationLog?: LogEntry[]; // Use LogEntry[]
}

// Helper function to render metadata nicely
const renderMetadata = (metadata: Record<string, any>, role: LogEntry['role']) => {
    let specificMetadata: Record<string, any> = {};

    // Extract specific fields based on role for cleaner display
    if (role === 'api_request' && metadata.payload) {
        specificMetadata = { RequestPayload: metadata.payload };
    } else if (role === 'api_response' && metadata.response) {
        // Simplify response display (optional)
        const simpleResponse = {
            id: metadata.response.id,
            model: metadata.response.model,
            usage: metadata.response.usage,
            finish_reason: metadata.response.choices?.[0]?.finish_reason,
            tool_calls: metadata.response.choices?.[0]?.message?.tool_calls,
        };
        specificMetadata = { ResponseDetails: simpleResponse };
    } else if (role === 'api_error' && metadata.error) {
        specificMetadata = { ErrorDetails: metadata.error };
    } else if (role === 'function' && (metadata.arguments || metadata.result)) {
         specificMetadata = {
             ...(metadata.arguments && { Arguments: metadata.arguments }),
             ...(metadata.result && { Result: metadata.result }),
         };
    } else if (role === 'memory' && metadata) {
         specificMetadata = metadata; // Show all metadata for memory
    } else {
        // Fallback for other roles or generic metadata
        specificMetadata = metadata;
    }

    // Filter out empty objects/arrays before rendering
    const filteredMetadata = Object.entries(specificMetadata).reduce((acc, [key, value]) => {
        const isEmptyObject = typeof value === 'object' && value !== null && Object.keys(value).length === 0;
        const isEmptyArray = Array.isArray(value) && value.length === 0;
        if (!isEmptyObject && !isEmptyArray && value !== undefined && value !== null) {
            acc[key] = value;
        }
        return acc;
    }, {} as Record<string, any>);


    if (Object.keys(filteredMetadata).length === 0) {
        return null; // Don't render empty metadata sections
    }

  return (
    <div className="chat-metadata">
      <strong>Details:</strong>
      <ul>
        {Object.entries(filteredMetadata).map(([key, value]) => (
          <li key={key}>
            <strong>{key}:</strong> <pre>{JSON.stringify(value, null, 2)}</pre>
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
            // No parsing needed, entry is already an object
            const { role, timestamp, content, metadata } = entry;

            // Format timestamp for better readability (optional)
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
                    <p>{content}</p>
                  </div>
                  {/* Render metadata using the helper */}
                  {metadata && renderMetadata(metadata, role)}
                </div>
              </div>
            );
          })
        ) : (
          <div className="chat-entry">Loading...</div>
        )}
      </div>
      {/* Add styles for new roles */}
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
            font-weight: normal;
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