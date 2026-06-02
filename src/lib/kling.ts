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
  name: string;
  coverImage: string;       // base64
  tag?: string;
  description?: string;
}

export interface KlingElementInfo {
  id: string;
  name: string;
  description: string;
  cover: { resource: string; width: number; height: number };
  tagList: string[];
  createTime: number;
}

export interface KlingElementListResult {
  elements: KlingElementInfo[];
}

export async function createElement(
  token: string,
  params: KlingElementCreateParams
): Promise<KlingElementInfo> {
  const data = await klingFetch(token, "/v1/elements", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return data.data.elements?.[0] || data.data;
}

export async function listElements(
  token: string
): Promise<KlingElementInfo[]> {
  const data = await klingFetch(token, "/v1/elements");
  return data.data?.elements || data.data || [];
}

export async function deleteElement(
  token: string,
  elementId: string
): Promise<void> {
  await klingFetch(token, `/v1/elements/${elementId}`, {
    method: "DELETE",
  });
}
