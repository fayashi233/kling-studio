import jwt from "jsonwebtoken";
import type { KlingParams, KlingImageParams, TaskResult } from "@/types";

const BASE_URL = "https://api-beijing.klingai.com";

export function generateToken(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5,
  };
  return jwt.sign(payload, secretKey, { algorithm: "HS256" });
}

async function klingFetch(
  token: string,
  endpoint: string,
  options: RequestInit = {}
) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling API error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function submitText2Video(
  token: string,
  params: KlingParams
): Promise<string> {
  const data = await klingFetch(token, "/v1/videos/text2video", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return data.data.task_id;
}

export async function submitImage2Video(
  token: string,
  params: KlingImageParams
): Promise<string> {
  const data = await klingFetch(token, "/v1/videos/image2video", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return data.data.task_id;
}

export async function getTaskStatus(
  token: string,
  taskId: string,
  taskType: string
): Promise<TaskResult> {
  // New Kling API requires type-specific status endpoints
  const type = taskType || "text2video";
  const data = await klingFetch(token, `/v1/videos/${type}/${taskId}`);
  return data.data;
}

// ── Element / Subject ──

export interface KlingElementCreateParams {
  element_name: string;
  element_description: string;
  reference_type: "image_refer" | "video_refer";
  element_image_list?: {
    frontal_image: string;
    refer_images?: { image_url: string }[];
  };
  element_video_list?: {
    refer_videos: { video_url: string }[];
  };
  tag_list?: { tag_id: string }[];
  element_voice_id?: string;
}

export interface KlingElementInfo {
  element_id: string;
  element_name: string;
  element_description: string;
  reference_type?: string;
  cover?: { resource: string; width?: number; height?: number };
  tag_list?: { tag_id: string }[];
  create_time?: number;
}

// Create element (async — returns task_id, poll with queryElementTask)
export async function createElement(
  token: string,
  params: KlingElementCreateParams
): Promise<{ taskId: string; status: string }> {
  const data = await klingFetch(token, "/v1/general/advanced-custom-elements", {
    method: "POST",
    body: JSON.stringify({ ...params, callback_url: "" }),
  });
  return { taskId: data.data.task_id, status: data.data.task_status };
}

// Query element creation / list task
export async function queryElementTask(
  token: string,
  taskId: string
): Promise<{ status: string; elements: KlingElementInfo[]; message?: string }> {
  const data = await klingFetch(token, `/v1/general/advanced-custom-elements/${taskId}`);
  return {
    status: data.data?.task_status || data.task_status || "unknown",
    elements: data.data?.task_result?.elements || data.task_result?.elements || [],
    message: data.data?.task_status_msg,
  };
}

// Poll element creation until succeed/failed
export async function pollElementTask(
  token: string,
  taskId: string,
  intervalMs = 5000,
  timeoutMs = 120000
): Promise<KlingElementInfo> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await queryElementTask(token, taskId);
    if (result.status === "succeed") {
      if (result.elements.length === 0) throw new Error("Element creation succeeded but returned no elements");
      return result.elements[0];
    }
    if (result.status === "failed") {
      throw new Error(`Element creation failed: ${result.message || "Unknown error"}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Element creation timed out");
}

// List custom elements (paginated)
export async function listElements(
  token: string,
  pageNum = 1,
  pageSize = 30
): Promise<KlingElementInfo[]> {
  const data = await klingFetch(
    token,
    `/v1/general/advanced-custom-elements?pageNum=${pageNum}&pageSize=${pageSize}`
  );
  const raw = data.data || data;
  // Response can be a single task object or an array
  const items = Array.isArray(raw) ? raw : [raw];
  const elements: KlingElementInfo[] = [];
  for (const item of items) {
    const elems = item?.task_result?.elements;
    if (Array.isArray(elems)) elements.push(...elems);
  }
  return elements;
}

// Delete element
export async function deleteElement(
  token: string,
  elementId: string
): Promise<void> {
  await klingFetch(token, "/v1/general/delete-elements", {
    method: "POST",
    body: JSON.stringify({ element_id: String(elementId) }),
  });
}
