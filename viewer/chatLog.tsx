import React from "react";

interface ChatLogProps {
  conversationLog?: string[];
}

const ChatLog: React.FC<ChatLogProps> = ({ conversationLog }) => {
  return (
    <div className="chat-log-container">
      <h2>FunctionCaller Chat Log</h2>
      <div className="chat-log-content">
        {conversationLog && conversationLog.length > 0 ? (
          conversationLog.map((line, index) => {
            // Determine if it's from the user or the assistant (or a fallback)
            // We treat lines starting with "USER:" as user messages
            // And lines starting with "ASSISTANT:", "TOOL CALL", or "FINAL RESPONSE" as model messages
            // Everything else we give a neutral style (you can adjust as desired).
            const isUser =
              line.startsWith("USER:");
            const isAssistant =
              line.startsWith("ASSISTANT:") ||
              line.startsWith("TOOL CALL") ||
              line.startsWith("FINAL RESPONSE");

            const messageClass = isUser
              ? "user-message"
              : isAssistant
              ? "assistant-message"
              : "system-message";

            return (
              <div className={`chat-line ${messageClass}`} key={index}>
                {line}
              </div>
            );
          })
        ) : (
          <div className="chat-line system-message">Loading...</div>
        )}
      </div>

      <style>{`
        .chat-log-container {
          font-family: Arial, sans-serif;
        }

        .chat-log-content {
          /* Allow the user to drag both horizontally and vertically */
          resize: both;
          overflow: auto;
          border: 1px solid #ccc;
          width: 400px; /* Starting width - can be resized by user */
          height: 300px; /* Starting height - can be resized by user */
          padding: 8px;
          border-radius: 4px;
          background-color: #f9f9f9;
        }

        .chat-line {
          margin-bottom: 8px;
          padding: 8px;
          border-radius: 4px;
          word-wrap: break-word;
        }

        .user-message {
          background-color: #add8e6; /* Light blue */
        }

        .assistant-message {
          background-color: #ffd580; /* Light orange / peach */
        }

        .system-message {
          background-color: #eeeeee; /* Neutral / grey background */
        }
      `}</style>
    </div>
  );
};

export default ChatLog;