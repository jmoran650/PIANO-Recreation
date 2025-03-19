// viewer/chatLog.tsx
import React from "react";

interface LogEntry {
  role: string;
  timestamp: string;
  content: string;
  metadata?: Record<string, any>;
}

interface ChatLogProps {
  conversationLog?: string[];
}

const ChatLog: React.FC<ChatLogProps> = ({ conversationLog }) => {
  return (
    <div className="chat-log-container">
      <h2>Conversation Log</h2>
      <div className="chat-log-content">
        {conversationLog && conversationLog.length > 0 ? (
          conversationLog.map((line, index) => {
            let entry: LogEntry;
            try {
              const parsed = JSON.parse(line);
              // Validate required properties exist
              if (
                typeof parsed.role === "string" &&
                typeof parsed.timestamp === "string" &&
                typeof parsed.content === "string"
              ) {
                entry = parsed;
              } else {
                entry = {
                  role: "system",
                  timestamp: "",
                  content: line,
                  metadata: {},
                };
              }
            } catch {
              // Fallback for non-JSON log lines
              entry = {
                role: "system",
                timestamp: "",
                content: line,
                metadata: {},
              };
            }
            const { role, timestamp, content, metadata } = entry;
            return (
              <div className="chat-entry" key={index}>
                <div className="chat-entry-header">
                  <div className="chat-role-container">
                    <span className={`chat-role ${role.toLowerCase()}`}>
                      {role.toUpperCase()}
                    </span>
                  </div>
                  <div className="chat-timestamp-container">
                    <span className="chat-timestamp">{timestamp}</span>
                  </div>
                </div>
                <div className="chat-entry-body">
                  <div className="chat-content">
                    <strong>Message:</strong>
                    <p>{content}</p>
                  </div>
                  {metadata && Object.keys(metadata).length > 0 && (
                    <div className="chat-metadata">
                      <strong>Metadata:</strong>
                      <ul>
                        {Object.entries(metadata).map(([key, value]) => (
                          <li key={key}>
                            <strong>{key}:</strong> {JSON.stringify(value)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="chat-entry">Loading...</div>
        )}
      </div>
      <style>{`
.chat-log-container {
  font-family: Arial, sans-serif;
  color: #333;
  box-sizing: border-box;
  /* Removed the fixed height so it can grow or shrink within the resizable sidebar */
  /* height: 100%; */
  margin: 0;
  padding: 0;
}

.chat-log-container h2 {
  margin: 0 0 12px 0;
}

.chat-log-content {
  overflow-y: auto;
  border: 1px solid #ddd;
  padding: 16px;
  border-radius: 8px;
  background-color: #fafafa;
}

.chat-entry {
  border-bottom: 1px solid #eee;
  padding: 12px 0;
  margin-bottom: 12px;
}

.chat-entry:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.chat-entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.chat-role-container {
  flex: 0 0 auto;
}

.chat-timestamp-container {
  flex: 0 0 auto;
  font-size: 0.85em;
  color: #999;
}

.chat-role {
  font-weight: bold;
  padding: 4px 8px;
  border-radius: 4px;
}

.chat-role.user {
  background-color: #add8e6;
  color: #000;
}

.chat-role.assistant {
  background-color: #ffd580;
  color: #000;
}

.chat-role.function {
  background-color: #c0ffc0;
  color: #000;
}

.chat-role.system {
  background-color: #eee;
  color: #666;
}

.chat-entry-body {
  padding-left: 8px;
}

.chat-content p {
  margin: 4px 0 0 0;
  white-space: pre-wrap;
}

.chat-metadata {
  margin-top: 8px;
  font-size: 0.85em;
  background-color: #f0f0f0;
  padding: 8px;
  border-radius: 4px;
}

.chat-metadata ul {
  margin: 4px 0 0 0;
  padding-left: 16px;
}

.chat-metadata li {
  margin-bottom: 4px;
}
`}</style>
    </div>
  );
};

export default ChatLog;