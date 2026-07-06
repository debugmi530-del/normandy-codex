export type AttachmentFile = {
  path: string;
  name: string;
  type: "file";
  content?: string;
  tooLarge?: boolean;
  error?: string;
};

export type AttachmentFolder = {
  path: string;
  name: string;
  type: "folder";
  children: Attachment[];
};

export type Attachment = AttachmentFile | AttachmentFolder;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  streaming?: boolean;
};

export type ModelCatalogEntry = {
  id: string;
  name: string;
  description: string;
  sizeLabel: string;
  fileName: string;
  url: string;
  recommended?: boolean;
  downloaded: boolean;
};

export type DownloadProgress = {
  modelId: string;
  downloaded: number;
  total: number;
  percent: number | null;
};

export type Profile = { id: string; name: string };

export type ModelStatus = {
  catalog: ModelCatalogEntry[];
  currentModelId: string | null;
  ready: boolean;
};

declare global {
  interface Window {
    codex: {
      models: {
        list: () => Promise<ModelCatalogEntry[]>;
        status: () => Promise<ModelStatus>;
        download: (modelId: string) => Promise<{ modelId: string; filePath: string }>;
        cancelDownload: () => Promise<boolean>;
        load: (modelId: string) => Promise<{ modelId: string }>;
        delete: (modelId: string) => Promise<boolean>;
        current: () => Promise<string | null>;
        onDownloadProgress: (cb: (data: DownloadProgress) => void) => () => void;
      };
      chat: {
        send: (payload: {
          profileId: string;
          message: string;
          attachments: Attachment[];
        }) => Promise<{ streamId: string }>;
        abort: () => Promise<boolean>;
        onToken: (cb: (data: { streamId: string; chunk: string }) => void) => () => void;
        onDone: (cb: (data: { streamId: string; full: string }) => void) => () => void;
        onError: (cb: (data: { streamId: string; message: string }) => void) => () => void;
      };
      profiles: {
        list: () => Promise<Profile[]>;
        create: (name: string) => Promise<Profile>;
        delete: (id: string) => Promise<Profile[]>;
      };
      history: {
        get: (profileId: string) => Promise<ChatMessage[]>;
        save: (profileId: string, history: ChatMessage[]) => Promise<boolean>;
      };
      files: {
        openFileDialog: () => Promise<Attachment[]>;
        openFolderDialog: () => Promise<Attachment | null>;
        readDropped: (paths: string[]) => Promise<Attachment[]>;
      };
      system: {
        startMonitor: () => Promise<boolean>;
        stopMonitor: () => Promise<boolean>;
        onStats: (cb: (data: { cpu: number; ram: number }) => void) => () => void;
      };
      app: {
        getDataPath: () => Promise<string>;
        wipeAllData: () => Promise<boolean>;
      };
    };
  }
}
