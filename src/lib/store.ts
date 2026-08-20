import { create } from "zustand";
import type { Locale } from "./i18n";
import type { AiModel, RepoFile } from "./repo-engine";

export type ViewId = "home" | "html" | "json" | "python" | "ai" | "info";
export type ThemeMode = "auto" | "light" | "dark" | "contrast";
export type LayoutMode = "auto" | "desktop" | "android";
export type WorkStatus = "idle" | "loading" | "ready" | "error";

export type HistoryEntry = {
  id: string;
  timestamp: string;
  action: string;
  model: string;
  status: "ok" | "error";
};

type Prefs = {
  theme: ThemeMode;
  lang: Locale;
  layout: LayoutMode;
  model: AiModel;
  githubUrl: string;
};

const PREFS_KEY = "rrr-prefs";
const HISTORY_KEY = "rrr-history";

function readPrefs(): Partial<Prefs> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<Prefs>;
  } catch {
    return {};
  }
}

function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

type AppState = Prefs & {
  view: ViewId;
  files: RepoFile[];
  source: string;
  repoName: string;
  branch: string;
  status: WorkStatus;
  statusDetail: string;
  history: HistoryEntry[];
  aiChunk: number;
  hydrated: boolean;
  setTheme: (theme: ThemeMode) => void;
  setLang: (lang: Locale) => void;
  setLayout: (layout: LayoutMode) => void;
  setModel: (model: AiModel) => void;
  setView: (view: ViewId) => void;
  setGithubUrl: (url: string) => void;
  setStatus: (status: WorkStatus, detail?: string) => void;
  ingest: (payload: {
    files: RepoFile[];
    source: string;
    repoName?: string;
    branch?: string;
    githubUrl?: string;
    detail: string;
  }) => void;
  addHistory: (action: string, model: string, status: "ok" | "error") => void;
  clearHistory: () => void;
  setAiChunk: (index: number) => void;
  hydrate: () => void;
};

function persist(state: AppState) {
  if (typeof window === "undefined") return;
  const prefs: Prefs = {
    theme: state.theme,
    lang: state.lang,
    layout: state.layout,
    model: state.model,
    githubUrl: state.githubUrl,
  };
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, 10)));
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: "auto",
  lang: "de",
  layout: "auto",
  model: "Grok",
  githubUrl: "",
  view: "home",
  files: [],
  source: "",
  repoName: "",
  branch: "",
  status: "idle",
  statusDetail: "",
  history: [],
  aiChunk: 0,
  hydrated: false,
  setTheme: (theme) => {
    set({ theme });
    persist(get());
  },
  setLang: (lang) => {
    set({ lang });
    persist(get());
  },
  setLayout: (layout) => {
    set({ layout });
    persist(get());
  },
  setModel: (model) => {
    set({ model, aiChunk: 0 });
    persist(get());
  },
  setView: (view) => set({ view }),
  setGithubUrl: (githubUrl) => {
    set({ githubUrl });
    persist(get());
  },
  setStatus: (status, detail = "") => set({ status, statusDetail: detail }),
  ingest: ({ files, source, repoName, branch, githubUrl, detail }) => {
    set({
      files,
      source,
      repoName: repoName ?? "",
      branch: branch ?? "",
      githubUrl: githubUrl ?? get().githubUrl,
      status: "ready",
      statusDetail: detail,
      aiChunk: 0,
    });
    persist(get());
  },
  addHistory: (action, model, status) => {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      action,
      model,
      status,
    };
    set({ history: [entry, ...get().history].slice(0, 10) });
    persist(get());
  },
  clearHistory: () => {
    set({ history: [] });
    persist(get());
  },
  setAiChunk: (aiChunk) => set({ aiChunk }),
  hydrate: () => {
    if (get().hydrated) return;
    const prefs = readPrefs();
    set({
      theme: prefs.theme ?? "auto",
      lang: prefs.lang ?? "de",
      layout: prefs.layout ?? "auto",
      model: prefs.model ?? "Grok",
      githubUrl: prefs.githubUrl ?? "",
      history: readHistory(),
      hydrated: true,
    });
  },
}));
