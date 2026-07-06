import type { ChatMessage } from "../types";

function renderContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (part.startsWith("```")) {
      const code = part.replace(/^```[a-zA-Z0-9]*\n?/, "").replace(/```$/, "");
      return (
        <pre key={index} className="code-block">
          <code>{code}</code>
        </pre>
      );
    }
    if (!part.trim()) return null;
    return (
      <p key={index} className="message-text">
        {part}
      </p>
    );
  });
}

export default function ChatMessageView({ message }: { message: ChatMessage }) {
  return (
    <div className={`message-row message-${message.role}`}>
      <div className="message-panel">
        <div className="message-meta">
          <span className="message-role">{message.role === "user" ? "Вы" : "Codex"}</span>
          {message.streaming && <span className="typing-dot" />}
        </div>
        {message.attachments && message.attachments.length > 0 && (
          <div className="attachment-list">
            {message.attachments.map((attachment) => (
              <span key={attachment.path} className="attachment-chip">
                {attachment.type === "folder" ? "\uD83D\uDCC1" : "\uD83D\uDCC4"} {attachment.name}
              </span>
            ))}
          </div>
        )}
        <div className="message-content">{renderContent(message.content)}</div>
      </div>
    </div>
  );
}
