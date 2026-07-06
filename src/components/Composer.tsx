import { useCallback, useState } from "react";
import type { Attachment } from "../types";

export default function Composer({
  attachments,
  onAttachmentsChange,
  onSend,
  onAbort,
  isGenerating,
}: {
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  onSend: (text: string) => void;
  onAbort: () => void;
  isGenerating: boolean;
}) {
  const [text, setText] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragActive(false);
      const paths = Array.from(event.dataTransfer.files)
        .map((file) => (file as File & { path?: string }).path)
        .filter((p): p is string => Boolean(p));
      if (paths.length === 0) return;
      const dropped = await window.codex.files.readDropped(paths);
      onAttachmentsChange([...attachments, ...dropped]);
    },
    [attachments, onAttachmentsChange]
  );

  const handleSubmit = () => {
    if (isGenerating) return;
    if (!text.trim() && attachments.length === 0) return;
    onSend(text);
    setText("");
  };

  return (
    <div
      className={`composer ${isDragActive ? "is-drag-active" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="attachment-tray">
          {attachments.map((attachment, index) => (
            <span key={attachment.path} className="attachment-chip removable">
              {attachment.type === "folder" ? "\uD83D\uDCC1" : "\uD83D\uDCC4"} {attachment.name}
              <button
                onClick={() => onAttachmentsChange(attachments.filter((_, i) => i !== index))}
                aria-label="Удалить вложение"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="composer-row">
        <button
          className="attach-btn"
          title="Прикрепить файл"
          onClick={async () => {
            const files = await window.codex.files.openFileDialog();
            if (files.length) onAttachmentsChange([...attachments, ...files]);
          }}
        >
          Файл
        </button>
        <button
          className="attach-btn"
          title="Прикрепить папку"
          onClick={async () => {
            const folder = await window.codex.files.openFolderDialog();
            if (folder) onAttachmentsChange([...attachments, folder]);
          }}
        >
          Папка
        </button>

        <textarea
          className="composer-input"
          placeholder="Напишите запрос — что написать, изучить, исправить или на что ответить..."
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          rows={2}
        />

        {isGenerating ? (
          <button className="send-btn is-stop" onClick={onAbort}>
            Стоп
          </button>
        ) : (
          <button className="send-btn" onClick={handleSubmit}>
            Отправить
          </button>
        )}
      </div>
    </div>
  );
}
