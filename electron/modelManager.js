import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { getLlama, LlamaChatSession } from "node-llama-cpp";

export const MODEL_CATALOG = [
  {
    id: "qwen2.5-coder-7b",
    name: "Qwen2.5-Coder-7B-Instruct",
    description:
      "Модель по умолчанию — сильна и в коде, и в обычных текстах. Рекомендуется при наличии GPU (например NVIDIA RTX).",
    sizeLabel: "~4.7 ГБ",
    fileName: "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    recommended: true,
  },
  {
    id: "qwen2.5-3b",
    name: "Qwen2.5-3B-Instruct",
    description: "Сбалансированный вариант для средних ПК — универсальная модель полегче.",
    sizeLabel: "~2 ГБ",
    fileName: "qwen2.5-3b-instruct-q4_k_m.gguf",
    url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
  },
  {
    id: "phi-3-mini",
    name: "Phi-3-mini-4k-instruct",
    description: "Самая лёгкая и быстрая модель — для слабых ПК без дискретной видеокарты.",
    sizeLabel: "~2.4 ГБ",
    fileName: "Phi-3-mini-4k-instruct-q4.gguf",
    url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
  },
];

const SYSTEM_PROMPT = `Ты — Codex, приватный офлайн ИИ-ассистент, который работает полностью локально на компьютере пользователя, без доступа в интернет и без передачи данных куда-либо.

У тебя есть четыре умения, и ты сам определяешь, какое из них нужно, исходя из содержания сообщения пользователя — пользователь НЕ выбирает режим вручную:
1. Писать — если просят создать текст с нуля (пост, письмо, идея, черновик), пиши качественный, законченный текст.
2. Изучать — если прислали код или текст с просьбой объяснить/разобрать/ответить на вопрос по содержимому, дай точный и понятный анализ.
3. Исправлять код — если прислали код с ошибкой или просьбой исправить, найди проблему, дай исправленную версию целиком и коротко объясни, что изменено и почему.
4. Отвечать на текст — если прислали чужое сообщение/письмо с просьбой отреагировать или составить ответ, подготовь готовый вариант ответа в подходящем тоне.

Если пользователь прикрепил файлы или папку — используй их содержимое как основной контекст. Если ошибка в коде связана с другим файлом из той же папки — учитывай связь между файлами.

Отвечай по существу, без лишней воды. Форматируй код в отдельных блоках с тройными обратными кавычками.`;

export class ModelManager {
  constructor({ modelsDir }) {
    this.modelsDir = modelsDir;
    this.currentModelId = null;
    this.llama = null;
    this.model = null;
    this.context = null;
    this.session = null;
    this.activeDownloadController = null;
    this.abortController = null;
    fs.mkdirSync(this.modelsDir, { recursive: true });
  }

  getCatalog() {
    return MODEL_CATALOG.map((entry) => ({ ...entry, downloaded: this._isDownloaded(entry.id) }));
  }

  getStatus() {
    return {
      catalog: this.getCatalog(),
      currentModelId: this.currentModelId,
      ready: Boolean(this.session),
    };
  }

  getCurrent() {
    return this.currentModelId;
  }

  _entryById(id) {
    const entry = MODEL_CATALOG.find((m) => m.id === id);
    if (!entry) throw new Error(`Неизвестная модель: ${id}`);
    return entry;
  }

  _filePath(id) {
    return path.join(this.modelsDir, this._entryById(id).fileName);
  }

  _metaPath(id) {
    return `${this._filePath(id)}.meta.json`;
  }

  _isDownloaded(id) {
    return fs.existsSync(this._filePath(id)) && fs.existsSync(this._metaPath(id));
  }

  async download(modelId, onProgress) {
    const entry = this._entryById(modelId);
    const filePath = this._filePath(modelId);
    const partPath = `${filePath}.part`;
    const metaPath = this._metaPath(modelId);

    const headResponse = await fetch(entry.url, { method: "HEAD" });
    if (!headResponse.ok) {
      throw new Error(`Не удалось получить информацию о модели (HTTP ${headResponse.status})`);
    }
    const totalSize = Number(headResponse.headers.get("content-length") || 0);

    let startByte = 0;
    if (fs.existsSync(partPath)) {
      startByte = fs.statSync(partPath).size;
    }
    if (totalSize && startByte >= totalSize) {
      startByte = 0;
      fs.unlinkSync(partPath);
    }

    const controller = new AbortController();
    this.activeDownloadController = controller;

    const headers = startByte > 0 ? { Range: `bytes=${startByte}-` } : {};
    const response = await fetch(entry.url, { headers, signal: controller.signal });
    if (!response.ok && response.status !== 206) {
      throw new Error(`Ошибка загрузки модели (HTTP ${response.status})`);
    }
    const isResumed = response.status === 206;

    const hash = crypto.createHash("sha256");
    if (isResumed && startByte > 0) {
      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(partPath);
        rs.on("data", (chunk) => hash.update(chunk));
        rs.on("end", resolve);
        rs.on("error", reject);
      });
    }

    const writeStream = fs.createWriteStream(partPath, { flags: isResumed ? "a" : "w" });
    let downloaded = isResumed ? startByte : 0;
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await new Promise((resolve, reject) => {
          writeStream.write(value, (err) => (err ? reject(err) : resolve()));
        });
        hash.update(value);
        downloaded += value.length;
        onProgress?.({
          modelId,
          downloaded,
          total: totalSize || downloaded,
          percent: totalSize ? Math.min(100, Math.round((downloaded / totalSize) * 100)) : null,
        });
      }
    } finally {
      await new Promise((resolve) => writeStream.end(resolve));
      this.activeDownloadController = null;
    }

    const finalSize = fs.statSync(partPath).size;
    if (totalSize && finalSize !== totalSize) {
      fs.unlinkSync(partPath);
      throw new Error("Файл модели скачался не полностью (обрыв соединения). Нажмите «Скачать» ещё раз — загрузка продолжится с места обрыва.");
    }

    fs.renameSync(partPath, filePath);
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          size: finalSize,
          sha256: hash.digest("hex"),
          downloadedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return { modelId, filePath };
  }

  cancelDownload() {
    this.activeDownloadController?.abort();
    return true;
  }

  async load(modelId) {
    const filePath = this._filePath(modelId);
    if (!this._isDownloaded(modelId) || !fs.existsSync(filePath)) {
      throw new Error("Модель не найдена локально — сначала скачайте её.");
    }

    if (this.model) {
      await this.session?.dispose?.();
      await this.context?.dispose?.();
      await this.model?.dispose?.();
      this.session = null;
      this.context = null;
      this.model = null;
    }

    if (!this.llama) {
      // node-llama-cpp автоматически выбирает лучший доступный движок (CUDA/Vulkan/CPU)
      this.llama = await getLlama();
    }

    this.model = await this.llama.loadModel({ modelPath: filePath });
    this.context = await this.model.createContext();
    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
      systemPrompt: SYSTEM_PROMPT,
    });
    this.currentModelId = modelId;
    return { modelId };
  }

  _describeFolder(folder) {
    const lines = [`Папка: ${folder.name}`];
    const walk = (node, indent) => {
      for (const child of node.children || []) {
        if (child.type === "folder") {
          lines.push(`${indent}[папка] ${child.name}/`);
          walk(child, `${indent}  `);
        } else {
          lines.push(`${indent}[файл] ${child.name}`);
          if (child.content) {
            lines.push("```\n" + child.content + "\n```");
          } else if (child.tooLarge) {
            lines.push(`${indent}  (файл слишком большой, пропущен)`);
          }
        }
      }
    };
    walk(folder, "  ");
    return lines.join("\n");
  }

  _buildPromptWithAttachments(message, attachments) {
    if (!attachments || attachments.length === 0) return message;
    const parts = [];
    for (const item of attachments) {
      if (item.type === "file" && item.content) {
        parts.push(`Файл: ${item.name}\n\`\`\`\n${item.content}\n\`\`\``);
      } else if (item.type === "folder") {
        parts.push(this._describeFolder(item));
      }
    }
    parts.push(`Запрос пользователя: ${message}`);
    return parts.join("\n\n");
  }

  async chat(message, attachments, { onToken } = {}) {
    if (!this.session) throw new Error("Модель ещё не загружена.");
    this.abortController = new AbortController();
    const prompt = this._buildPromptWithAttachments(message, attachments);
    const response = await this.session.prompt(prompt, {
      signal: this.abortController.signal,
      onTextChunk: (chunk) => onToken?.(chunk),
    });
    return response;
  }

  abort() {
    this.abortController?.abort();
    return true;
  }

  async delete(modelId) {
    const filePath = this._filePath(modelId);
    const metaPath = this._metaPath(modelId);
    for (const p of [filePath, metaPath, `${filePath}.part`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    if (this.currentModelId === modelId) {
      this.currentModelId = null;
      this.session = null;
    }
    return true;
  }

  async deleteAll() {
    for (const entry of MODEL_CATALOG) {
      await this.delete(entry.id);
    }
    return true;
  }
}
