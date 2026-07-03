import type { KlingParams, TaskResult } from "@/types";

const DEFAULT_BASE = "https://dashscope.aliyuncs.com/api/v1";

interface DashScopeResponse {
  request_id: string;
  output?: {
    task_id?: string;
    task_status?: string;
    video_url?: string;
    video_urls?: string[];
    code?: string;
    message?: string;
    results?: Array<{ url?: string; video_url?: string }>;
  };
  code?: string;
  message?: string;
}

function mapStatus(ds: string): TaskResult["task_status"] {
  switch (ds) {
    case "PENDING":
    case "RUNNING":
      return "processing";
    case "SUCCEEDED":
      return "succeed";
    case "FAILED":
      return "failed";
    default:
      return "processing";
  }
}

/** 判断是否为万相系列（文生/图生视频的请求格式不同） */
function isWanModel(name: string): boolean {
  return name.startsWith("wan");
}

function buildRequestBody(
  params: KlingParams,
  image?: string,
  lastFrame?: string,
  audioUrl?: string,
  videoClip?: string,
  elementIds?: string[]
): Record<string, unknown> {
  const model = params.model_name;

  if (isWanModel(model)) {
    // ── 万相系列 ──
    const isT2V = model.includes("t2v");
    const input: Record<string, unknown> = { prompt: params.prompt };
    const parameters: Record<string, unknown> = {
      duration: Number(params.duration),
      prompt_extend: true,
      watermark: true,
    };

    if (isT2V) {
      parameters.resolution = params.mode === "pro" ? "1080P" : "720P";
      parameters.ratio = params.aspect_ratio;
      if (audioUrl) input.audio_url = audioUrl;
    } else {
      // 图生视频
      parameters.resolution = params.mode === "pro" ? "1080P" : "720P";
      const media: Array<Record<string, string>> = [];
      if (videoClip) media.push({ type: "first_clip", url: videoClip });
      if (image) media.push({ type: "first_frame", url: image });
      if (lastFrame) media.push({ type: "last_frame", url: lastFrame });
      if (audioUrl) media.push({ type: "driving_audio", url: audioUrl });
      if (media.length > 0) input.media = media;
    }

    return { model, input, parameters };
  }

  // ── 可灵系列（通过百炼调用） ──
  // 百炼上可灵图生视频也用 media 数组格式
  const hasImage = !!(image || lastFrame || videoClip);
  const input: Record<string, unknown> = { prompt: params.prompt };
  const parameters: Record<string, unknown> = {
    duration: Number(params.duration),
  };

  // 文生视频用 ratio，图生视频不用
  if (!hasImage) {
    parameters.ratio = params.aspect_ratio;
  }

  parameters.resolution = params.mode === "4k" ? "4K" : params.mode === "pro" ? "1080P" : "720P";

  if (params.negative_prompt) {
    input.negative_prompt = params.negative_prompt;
  }

  // 图生视频：使用 media 数组
  if (hasImage) {
    const media: Array<Record<string, string>> = [];
    if (videoClip) media.push({ type: "first_clip", url: videoClip });
    if (image) media.push({ type: "first_frame", url: image });
    if (lastFrame) media.push({ type: "last_frame", url: lastFrame });
    if (audioUrl) media.push({ type: "driving_audio", url: audioUrl });
    if (media.length > 0) input.media = media;
  }

  if (elementIds && elementIds.length > 0) {
    input.element_list = elementIds.map(id => ({ element_id: String(id) }));
  }

  return { model, input, parameters };
}

export async function dashscopeSubmit(
  apiKey: string,
  params: KlingParams,
  image?: string,
  baseUrl?: string,
  extra?: { lastFrame?: string; audioUrl?: string; videoClip?: string; elementIds?: string[] }
): Promise<string> {
  const base = baseUrl || DEFAULT_BASE;
  const body = buildRequestBody(
    params,
    image,
    extra?.lastFrame,
    extra?.audioUrl,
    extra?.videoClip,
    extra?.elementIds
  );

  // DashScope 所有视频生成模型统一使用 /video-synthesis 端点
  const endpoint = `${base}/services/aigc/video-generation/video-synthesis`;

  // Log (truncate base64)
  const logBody = JSON.parse(JSON.stringify(body));
  if (logBody.input?.media) {
    for (const m of logBody.input.media) {
      if (m.url?.startsWith("data:")) m.url = m.url.substring(0, 50) + "...[base64]";
    }
  }
  if (logBody.input?.image && typeof logBody.input.image === "string" && logBody.input.image.startsWith("data:")) {
    logBody.input.image = logBody.input.image.substring(0, 50) + "...[base64]";
  }
  console.log("[DashScope] POST", endpoint);
  console.log("[DashScope] Body:", JSON.stringify(logBody, null, 2));

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
  });

  const data: DashScopeResponse = await res.json();
  console.log("[DashScope] Response:", JSON.stringify(data, null, 2));

  if (!res.ok || !data.output?.task_id) {
    const errDetail = data.message || data.code || data.output?.message || res.statusText;
    throw new Error(`DashScope error (${res.status}): ${errDetail}`);
  }
  return data.output.task_id;
}

export async function dashscopeStatus(
  apiKey: string,
  taskId: string,
  baseUrl?: string
): Promise<TaskResult> {
  const base = baseUrl || DEFAULT_BASE;

  const res = await fetch(`${base}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const data: DashScopeResponse = await res.json();
  console.log("[DashScope] Status:", JSON.stringify(data, null, 2));

  if (!res.ok) {
    throw new Error(`DashScope status error (${res.status}): ${data.message || res.statusText}`);
  }

  const status = mapStatus(data.output?.task_status || "PENDING");

  let videoUrl: string | undefined;
  if (data.output?.video_url) videoUrl = data.output.video_url;
  else if (data.output?.video_urls?.[0]) videoUrl = data.output.video_urls[0];
  else if (data.output?.results?.[0]) videoUrl = data.output.results[0].url || data.output.results[0].video_url;

  return {
    task_id: taskId,
    task_status: status,
    task_status_msg: data.output?.message || data.output?.code,
    task_result: videoUrl ? { videos: [{ url: videoUrl }] } : undefined,
  };
}
