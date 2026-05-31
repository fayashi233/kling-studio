import jwt from "jsonwebtoken";
import type { KlingParams, KlingImageParams, TaskResult } from "@/types";

const BASE_URL = "https://api.klingai.com";

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
  taskId: string
): Promise<TaskResult> {
  const data = await klingFetch(token, `/v1/videos/${taskId}`);
  return data.data;
}
