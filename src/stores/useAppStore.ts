import { create } from "zustand";
import type {
  KlingParams,
  ModelName,
  Mode,
  Duration,
  AspectRatio,
  TaskResult,
  PromptRecord,
  ImageRecord,
  AppSettings,
  ElementRecord,
} from "@/types";

interface GenerationTask {
  id: string;
  promptId: string;
  taskId: string;
  status: TaskResult["task_status"];
  videoUrl?: string;
  errorMsg?: string;
  startedAt: number;
}

interface AppState {
  // Config
  params: KlingParams;
  setParams: (params: Partial<KlingParams>) => void;

  // Reference image
  currentImage: string | null;
  setCurrentImage: (img: string | null) => void;
  currentLastFrame: string | null;
  setCurrentLastFrame: (img: string | null) => void;
  referenceMode: "single" | "firstlast";
  setReferenceMode: (mode: "single" | "firstlast") => void;
  images: ImageRecord[];
  setImages: (images: ImageRecord[]) => void;

  // Generation
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;
  currentTask: GenerationTask | null;
  setCurrentTask: (task: GenerationTask | null) => void;

  // History
  history: GenerationTask[];
  addToHistory: (task: GenerationTask) => void;
  updateHistoryTask: (taskId: string, update: Partial<GenerationTask>) => void;
  setHistory: (history: GenerationTask[]) => void;

  // Prompts
  savedPrompts: PromptRecord[];
  setSavedPrompts: (prompts: PromptRecord[]) => void;

  // Settings
  settings: AppSettings;
  setSettings: (settings: Partial<AppSettings>) => void;
  settingsLoaded: boolean;
  setSettingsLoaded: (v: boolean) => void;

  // Current prompt being edited (links to prompt library)
  currentPromptId: string | null;
  setCurrentPromptId: (id: string | null) => void;

  // LLM
  llmLoading: boolean;
  setLlmLoading: (v: boolean) => void;

  // Element / Subject binding
  elements: ElementRecord[];
  setElements: (elements: ElementRecord[]) => void;
  selectedElementIds: string[];
  setSelectedElementIds: (ids: string[]) => void;
  toggleElementId: (id: string) => void;
}

const defaultParams: KlingParams = {
  model_name: "kling-v3" as ModelName,
  prompt: "",
  negative_prompt: "",
  mode: "std" as Mode,
  duration: "5" as Duration,
  aspect_ratio: "16:9" as AspectRatio,
  cfg_scale: 0.5,
};

const defaultSettings: AppSettings = {
  provider: "kling-official",
  kling_access_key: "",
  kling_secret_key: "",
  dashscope_api_key: "",
  dashscope_base_url: "",
  llm_provider: "openai",
  llm_api_key: "",
  llm_base_url: "",
  llm_model: "gpt-4o-mini",
};

export const useAppStore = create<AppState>((set) => ({
  params: defaultParams,
  setParams: (update) =>
    set((s) => ({ params: { ...s.params, ...update } })),

  currentImage: null,
  setCurrentImage: (img) => set({ currentImage: img }),
  currentLastFrame: null,
  setCurrentLastFrame: (img) => set({ currentLastFrame: img }),
  referenceMode: "single",
  setReferenceMode: (mode) => set({ referenceMode: mode }),
  images: [],
  setImages: (images) => set({ images }),

  isGenerating: false,
  setIsGenerating: (v) => set({ isGenerating: v }),
  currentTask: null,
  setCurrentTask: (task) => set({ currentTask: task }),

  history: [],
  addToHistory: (task) =>
    set((s) => ({ history: [task, ...s.history] })),
  updateHistoryTask: (taskId, update) =>
    set((s) => ({
      history: s.history.map((t) =>
        t.taskId === taskId ? { ...t, ...update } : t
      ),
      currentTask:
        s.currentTask?.taskId === taskId
          ? { ...s.currentTask, ...update }
          : s.currentTask,
    })),
  setHistory: (history) => set({ history }),

  savedPrompts: [],
  setSavedPrompts: (prompts) => set({ savedPrompts: prompts }),

  currentPromptId: null,
  setCurrentPromptId: (id) => set({ currentPromptId: id }),

  settings: defaultSettings,
  setSettings: (update) =>
    set((s) => ({ settings: { ...s.settings, ...update } })),
  settingsLoaded: false,
  setSettingsLoaded: (v) => set({ settingsLoaded: v }),

  llmLoading: false,
  setLlmLoading: (v) => set({ llmLoading: v }),

  elements: [],
  setElements: (elements) => set({ elements }),
  selectedElementIds: [],
  setSelectedElementIds: (ids) => set({ selectedElementIds: ids }),
  toggleElementId: (id) =>
    set((s) => ({
      selectedElementIds: s.selectedElementIds.includes(id)
        ? s.selectedElementIds.filter((eid) => eid !== id)
        : [...s.selectedElementIds, id],
    })),
}));
