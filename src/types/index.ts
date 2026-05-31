// ──── Provider ────
export type ProviderId = "kling-official" | "dashscope";

export interface ProviderDef {
  id: ProviderId;
  label: string;
  description: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "kling-official",
    label: "可灵官方",
    description: "api-beijing.klingai.com · AK/SK 鉴权",
  },
  {
    id: "dashscope",
    label: "阿里云百炼",
    description: "DashScope · 支持可灵 & 万相系列",
  },
];

// ──── Models ────
export type KlingOfficialModel =
  | "kling-v1"
  | "kling-v1-5"
  | "kling-v1-6"
  | "kling-v2"
  | "kling-v2-master"
  | "kling-v2-1"
  | "kling-v2-1-master"
  | "kling-v2-5-turbo"
  | "kling-v2-6"
  | "kling-v3"
  | "kling-v3-omni"
  | "kling-video-o1";

export type DashScopeModel =
  // 万相 文生视频
  | "wan2.7-t2v-2026-04-25"
  | "wan2.7-t2v"
  | "wan2.6-t2v"
  | "wan2.5-t2v-preview"
  | "wan2.2-t2v-plus"
  | "wanx2.1-t2v-turbo"
  | "wanx2.1-t2v-plus"
  // 万相 图生视频
  | "wan2.7-i2v-2026-04-25"
  | "wan2.7-i2v"
  // 可灵
  | "kling-v1"
  | "kling-v2"
  | "kling/kling-v3-video-generation"
  | string; // 允许自定义输入

export type ModelName = KlingOfficialModel | DashScopeModel;

export type Mode = "std" | "pro" | "4k";
export type Duration = "3" | "5" | "10" | "15";
export type AspectRatio = "16:9" | "9:16" | "1:1";

export interface KlingParams {
  model_name: ModelName;
  prompt: string;
  negative_prompt?: string;
  mode: Mode;
  duration: Duration;
  aspect_ratio: AspectRatio;
  cfg_scale: number;
}

export interface KlingImageParams extends KlingParams {
  image: string;
}

export type TaskStatus = "submitted" | "processing" | "succeed" | "failed";

export interface TaskResult {
  task_id: string;
  task_status: TaskStatus;
  task_status_msg?: string;
  task_result?: {
    videos: Array<{ url: string; id?: string }>;
  };
  created_at?: number;
  updated_at?: number;
}

export interface PromptRecord {
  id: string;
  prompt: string;
  negative_prompt: string;
  model_name: string;
  mode: Mode;
  duration: Duration;
  aspect_ratio: AspectRatio;
  cfg_scale: number;
  reference_image: string | null;
  is_favorite: boolean;
  tags: string;
  group_name: string;
  created_at: string;
}

export interface GenerationRecord {
  id: string;
  prompt_id: string;
  task_id: string;
  task_status: TaskStatus;
  video_url: string | null;
  error_msg: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ImageRecord {
  id: string;
  path: string;
  label: string;
  created_at: string;
}

export interface AppSettings {
  provider: ProviderId;
  kling_access_key: string;
  kling_secret_key: string;
  dashscope_api_key: string;
  dashscope_base_url: string;
  llm_provider: "openai" | "claude" | "custom";
  llm_api_key: string;
  llm_base_url: string;
  llm_model: string;
}

export interface ImportedPrompt {
  title: string;
  prompt: string;
  negative_prompt?: string;
  model_name?: ModelName;
  mode?: Mode;
  duration?: Duration;
  aspect_ratio?: AspectRatio;
  cfg_scale?: number;
}

// ──── Model Configs per Provider ────
export interface ModelConfig {
  name: ModelName;
  label: string;
  modes: Mode[];
  durations: Duration[];
  supportsImage: boolean;
  supportsMultiShot: boolean;
  supportsFirstLastFrame: boolean;
  supportsAudio: boolean;
  supportsMotion: boolean;
  supports4k: boolean;
}

export const KLING_OFFICIAL_MODELS: ModelConfig[] = [
  {
    name: "kling-v3-omni",
    label: "kling-v3-omni",
    modes: ["std", "pro", "4k"],
    durations: ["3", "5", "10", "15"],
    supportsImage: true, supportsMultiShot: true, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: true, supports4k: true,
  },
  {
    name: "kling-v3",
    label: "kling-v3",
    modes: ["std", "pro", "4k"],
    durations: ["3", "5", "10", "15"],
    supportsImage: true, supportsMultiShot: true, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: true, supports4k: true,
  },
  {
    name: "kling-video-o1",
    label: "kling-video-o1",
    modes: ["std", "pro"],
    durations: ["3", "5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "kling-v2-6",
    label: "kling-v2-6",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: true,
    supportsAudio: true, supportsMotion: true, supports4k: false,
  },
  {
    name: "kling-v2-5-turbo",
    label: "kling-v2-5-turbo",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "kling-v2-1-master",
    label: "kling-v2-1-master",
    modes: ["pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: false,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "kling-v2-1",
    label: "kling-v2-1",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "kling-v2-master",
    label: "kling-v2-master",
    modes: ["pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: false,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "kling-v2",
    label: "kling-v2",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: false,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "kling-v1-6",
    label: "kling-v1-6",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "kling-v1-5",
    label: "kling-v1-5",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: true, supports4k: false,
  },
  {
    name: "kling-v1",
    label: "kling-v1",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: true, supports4k: false,
  },
];

export const DASHSCOPE_MODELS: ModelConfig[] = [
  // ── 万相 2.7 文生视频 ──
  {
    name: "wan2.7-t2v-2026-04-25",
    label: "万相 2.7 文生视频 (推荐)",
    modes: ["std", "pro"],
    durations: ["3", "5", "10", "15"],
    supportsImage: false, supportsMultiShot: true, supportsFirstLastFrame: false,
    supportsAudio: true, supportsMotion: false, supports4k: false,
  },
  {
    name: "wan2.7-t2v",
    label: "万相 2.7 文生视频",
    modes: ["std", "pro"],
    durations: ["3", "5", "10", "15"],
    supportsImage: false, supportsMultiShot: true, supportsFirstLastFrame: false,
    supportsAudio: true, supportsMotion: false, supports4k: false,
  },
  // ── 万相 2.7 图生视频 ──
  {
    name: "wan2.7-i2v-2026-04-25",
    label: "万相 2.7 图生视频 (推荐)",
    modes: ["std", "pro"],
    durations: ["3", "5", "10", "15"],
    supportsImage: true, supportsMultiShot: true, supportsFirstLastFrame: true,
    supportsAudio: true, supportsMotion: false, supports4k: false,
  },
  {
    name: "wan2.7-i2v",
    label: "万相 2.7 图生视频",
    modes: ["std", "pro"],
    durations: ["3", "5", "10", "15"],
    supportsImage: true, supportsMultiShot: true, supportsFirstLastFrame: true,
    supportsAudio: true, supportsMotion: false, supports4k: false,
  },
  // ── 万相 2.6 ──
  {
    name: "wan2.6-t2v",
    label: "万相 2.6 文生视频",
    modes: ["std", "pro"],
    durations: ["3", "5", "10", "15"],
    supportsImage: false, supportsMultiShot: true, supportsFirstLastFrame: false,
    supportsAudio: true, supportsMotion: false, supports4k: false,
  },
  // ── 万相 2.5 ──
  {
    name: "wan2.5-t2v-preview",
    label: "万相 2.5 文生视频 (预览)",
    modes: ["std"],
    durations: ["5", "10"],
    supportsImage: false, supportsMultiShot: false, supportsFirstLastFrame: false,
    supportsAudio: true, supportsMotion: false, supports4k: false,
  },
  // ── 万相 2.2 / 2.1 ──
  {
    name: "wan2.2-t2v-plus",
    label: "万相 2.2 文生视频 Plus",
    modes: ["std"],
    durations: ["5"],
    supportsImage: false, supportsMultiShot: false, supportsFirstLastFrame: false,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "wanx2.1-t2v-turbo",
    label: "万相 2.1 文生视频 Turbo",
    modes: ["std"],
    durations: ["5"],
    supportsImage: false, supportsMultiShot: false, supportsFirstLastFrame: false,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "wanx2.1-t2v-plus",
    label: "万相 2.1 文生视频 Plus",
    modes: ["std"],
    durations: ["5"],
    supportsImage: false, supportsMultiShot: false, supportsFirstLastFrame: false,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  // ── 可灵 (通过百炼) ──
  // DashScope 上可灵模型名格式为 kling/kling-v3-video-generation
  {
    name: "kling/kling-v3-video-generation",
    label: "可灵 v3 (百炼)",
    modes: ["std", "pro", "4k"],
    durations: ["3", "5", "10", "15"],
    supportsImage: true, supportsMultiShot: true, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: true, supports4k: true,
  },
  {
    name: "kling-v2",
    label: "可灵 v2 (百炼)",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: false,
    supportsAudio: false, supportsMotion: false, supports4k: false,
  },
  {
    name: "kling-v1",
    label: "可灵 v1 (百炼)",
    modes: ["std", "pro"],
    durations: ["5", "10"],
    supportsImage: true, supportsMultiShot: false, supportsFirstLastFrame: true,
    supportsAudio: false, supportsMotion: true, supports4k: false,
  },
];

export function getModelsForProvider(provider: ProviderId): ModelConfig[] {
  return provider === "dashscope" ? DASHSCOPE_MODELS : KLING_OFFICIAL_MODELS;
}

export function getModelConfig(
  provider: ProviderId,
  name: ModelName
): ModelConfig {
  const models = getModelsForProvider(provider);
  return models.find((m) => m.name === name) || models[0];
}
