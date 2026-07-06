import { useEffect, useState } from "react";
import type { ModelCatalogEntry, DownloadProgress } from "../types";

export default function ModelSetup({
  catalog,
  onSelect,
  loading,
}: {
  catalog: ModelCatalogEntry[];
  onSelect: (modelId: string) => void;
  loading: boolean;
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.codex.models.onDownloadProgress((data) => setProgress(data));
  }, []);

  const handleDownload = async (modelId: string) => {
    setError(null);
    setDownloadingId(modelId);
    setProgress(null);
    try {
      await window.codex.models.download(modelId);
      onSelect(modelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingId(null);
      setProgress(null);
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-panel">
        <h1 className="setup-title">Выбор модели</h1>
        <p className="setup-subtitle">
          Модель скачивается один раз — дальше приложение работает полностью офлайн, без
          подключения к интернету.
        </p>

        <div className="model-list">
          {catalog.map((model) => (
            <div key={model.id} className={`model-card ${model.recommended ? "is-recommended" : ""}`}>
              <div className="model-card-header">
                <span className="model-name">{model.name}</span>
                {model.recommended && <span className="model-tag">По умолчанию</span>}
                <span className="model-size">{model.sizeLabel}</span>
              </div>
              <p className="model-description">{model.description}</p>

              {downloadingId === model.id ? (
                <div className="download-progress">
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress?.percent ?? 0}%` }} />
                  </div>
                  <span className="progress-label">
                    {progress?.percent != null ? `${progress.percent}%` : "Загрузка..."}
                  </span>
                </div>
              ) : model.downloaded ? (
                <button className="primary-btn" disabled={loading} onClick={() => onSelect(model.id)}>
                  {loading ? "Загрузка модели в память..." : "Использовать эту модель"}
                </button>
              ) : (
                <button className="secondary-btn" onClick={() => handleDownload(model.id)}>
                  Скачать модель
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <div className="setup-error">{error}</div>}
      </div>
    </div>
  );
}
