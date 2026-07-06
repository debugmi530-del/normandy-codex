import { useState } from "react";
import type { ModelCatalogEntry } from "../types";

export default function SettingsModal({
  catalog,
  currentModelId,
  onClose,
  onSelectModel,
  onRefreshCatalog,
}: {
  catalog: ModelCatalogEntry[];
  currentModelId: string | null;
  onClose: () => void;
  onSelectModel: (modelId: string) => void;
  onRefreshCatalog: () => void;
}) {
  const [wiping, setWiping] = useState(false);

  const handleDelete = async (modelId: string) => {
    await window.codex.models.delete(modelId);
    onRefreshCatalog();
  };

  const handleWipeAll = async () => {
    if (!window.confirm("Удалить все данные приложения безвозвратно (модели, история, настройки)?")) return;
    setWiping(true);
    try {
      await window.codex.app.wipeAllData();
      window.location.reload();
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Настройки</h2>
          <button className="icon-btn" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <h3 className="modal-section-title">Модели</h3>
        <div className="settings-model-list">
          {catalog.map((model) => (
            <div key={model.id} className="settings-model-row">
              <div>
                <div className="model-name">{model.name}</div>
                <div className="model-size">{model.sizeLabel}</div>
              </div>
              <div className="settings-model-actions">
                {model.id === currentModelId && <span className="model-tag">Активна</span>}
                {model.downloaded ? (
                  <>
                    {model.id !== currentModelId && (
                      <button className="secondary-btn" onClick={() => onSelectModel(model.id)}>
                        Использовать
                      </button>
                    )}
                    <button className="danger-btn" onClick={() => handleDelete(model.id)}>
                      Удалить
                    </button>
                  </>
                ) : (
                  <span className="muted">Не скачана</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <h3 className="modal-section-title">Данные</h3>
        <p className="settings-note">
          Полное удаление всех данных приложения (модели, история переписки, настройки) с диска.
          Это действие необратимо.
        </p>
        <button className="danger-btn" onClick={handleWipeAll} disabled={wiping}>
          {wiping ? "Удаление..." : "Удалить все данные приложения"}
        </button>
      </div>
    </div>
  );
}
