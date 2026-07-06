import { useEffect, useRef, useState } from "react";
import type { Attachment, ChatMessage, ModelCatalogEntry, Profile } from "./types";
import ModelSetup from "./components/ModelSetup";
import Composer from "./components/Composer";
import ChatMessageView from "./components/ChatMessageView";
import SystemMonitor from "./components/SystemMonitor";
import ProfileSwitcher from "./components/ProfileSwitcher";
import SettingsModal from "./components/SettingsModal";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("default");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const streamIdRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const status = await window.codex.models.status();
      setCatalog(status.catalog);
      setCurrentModelId(status.currentModelId);
      setModelReady(status.ready);

      const profileList = await window.codex.profiles.list();
      setProfiles(profileList);
    })();

    window.codex.system.startMonitor();
    return () => {
      window.codex.system.stopMonitor();
    };
  }, []);

  useEffect(() => {
    (async () => {
      const history = await window.codex.history.get(activeProfileId);
      setMessages(history);
    })();
  }, [activeProfileId]);

  useEffect(() => {
    if (!modelReady) return;
    window.codex.history.save(activeProfileId, messages);
  }, [messages, activeProfileId, modelReady]);

  useEffect(() => {
    const offToken = window.codex.chat.onToken(({ streamId, chunk }) => {
      if (streamId !== streamIdRef.current) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          next[next.length - 1] = { ...last, content: last.content + chunk };
        }
        return next;
      });
    });
    const offDone = window.codex.chat.onDone(({ streamId }) => {
      if (streamId !== streamIdRef.current) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") next[next.length - 1] = { ...last, streaming: false };
        return next;
      });
      setIsGenerating(false);
      streamIdRef.current = null;
    });
    const offError = window.codex.chat.onError(({ streamId, message }) => {
      if (streamId !== streamIdRef.current) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, content: `Ошибка: ${message}`, streaming: false };
        }
        return next;
      });
      setIsGenerating(false);
      streamIdRef.current = null;
    });
    return () => {
      offToken();
      offDone();
      offError();
    };
  }, []);

  const handleSelectModel = async (modelId: string) => {
    setLoadingModel(true);
    try {
      await window.codex.models.load(modelId);
      const status = await window.codex.models.status();
      setCatalog(status.catalog);
      setCurrentModelId(status.currentModelId);
      setModelReady(status.ready);
    } finally {
      setLoadingModel(false);
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim() && pendingAttachments.length === 0) return;
    const userMessage: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      attachments: pendingAttachments,
    };
    const assistantMessage: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      streaming: true,
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setPendingAttachments([]);
    setIsGenerating(true);

    const { streamId } = await window.codex.chat.send({
      profileId: activeProfileId,
      message: text,
      attachments: userMessage.attachments || [],
    });
    streamIdRef.current = streamId;
  };

  const handleAbort = async () => {
    await window.codex.chat.abort();
    setIsGenerating(false);
  };

  const needsSetup = !modelReady;
  const activeModel = catalog.find((m) => m.id === currentModelId);

  return (
    <div className="app-shell">
      <div className="hud-corner hud-corner-tl" />
      <div className="hud-corner hud-corner-br" />

      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" />
          <span className="brand-name">NORMANDY CODEX</span>
        </div>

        <div className="header-status">
          <span className={`model-badge ${modelReady ? "is-ready" : ""}`}>
            {modelReady ? activeModel?.name ?? "Модель готова" : "Модель не загружена"}
          </span>
        </div>

        <div className="header-actions">
          <ProfileSwitcher
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSelect={setActiveProfileId}
            onCreate={async (name) => {
              const profile = await window.codex.profiles.create(name);
              setProfiles((prev) => [...prev, profile]);
              setActiveProfileId(profile.id);
            }}
          />
          <button className="icon-btn" onClick={() => setSettingsOpen(true)}>
            Настройки
          </button>
        </div>
      </header>

      <main className="app-main">
        {needsSetup ? (
          <ModelSetup catalog={catalog} onSelect={handleSelectModel} loading={loadingModel} />
        ) : (
          <>
            <div className="chat-scroll">
              {messages.length === 0 && (
                <div className="empty-state">
                  Начните диалог — попросите написать текст, объяснить код, исправить ошибку
                  или ответить на присланное сообщение. Режим выбирать не нужно — Codex сам
                  поймёт задачу.
                </div>
              )}
              {messages.map((message) => (
                <ChatMessageView key={message.id} message={message} />
              ))}
            </div>
            <Composer
              attachments={pendingAttachments}
              onAttachmentsChange={setPendingAttachments}
              onSend={handleSend}
              onAbort={handleAbort}
              isGenerating={isGenerating}
            />
          </>
        )}
      </main>

      <SystemMonitor />

      {settingsOpen && (
        <SettingsModal
          catalog={catalog}
          currentModelId={currentModelId}
          onClose={() => setSettingsOpen(false)}
          onSelectModel={handleSelectModel}
          onRefreshCatalog={async () => {
            const status = await window.codex.models.status();
            setCatalog(status.catalog);
            setCurrentModelId(status.currentModelId);
            setModelReady(status.ready);
          }}
        />
      )}
    </div>
  );
}
