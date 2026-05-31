import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateToken, submitText2Video, submitImage2Video } from "@/lib/kling";
import { dashscopeSubmit } from "@/lib/dashscope";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import type { KlingParams, KlingImageParams, AppSettings, ProviderId } from "@/types";

/** Resolve an image path/URL to a format usable by the API.
 *  Local /uploads/ files → base64 data URI.
 *  Remote URLs → pass through as-is.
 */
function resolveImage(db: ReturnType<typeof getDb>, image: string): string {
  if (image.startsWith("data:")) return image; // already base64
  if (image.startsWith("http://") || image.startsWith("https://")) return image;

  // Local uploads — try reading from DB cache first
  if (image.startsWith("/uploads/")) {
    const row = db
      .prepare("SELECT base64_data FROM images WHERE path = ?")
      .get(image) as { base64_data: string } | undefined;
    if (row?.base64_data) {
      console.log("[resolveImage] DB hit, base64 length:", row.base64_data.length);
      return row.base64_data;
    }

    // Fallback: read from disk
    const filepath = path.join(process.cwd(), "public", image);
    if (fs.existsSync(filepath)) {
      const buffer = fs.readFileSync(filepath);
      const ext = image.split(".").pop()?.toLowerCase() || "jpg";
      const mime =
        ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const b64 = `data:${mime};base64,${buffer.toString("base64")}`;
      console.log("[resolveImage] Disk read, base64 length:", b64.length);
      // Cache for next time
      db.prepare("UPDATE images SET base64_data = ? WHERE path = ?").run(b64, image);
      return b64;
    }

    console.log("[resolveImage] File not found:", filepath);
  }

  // If it's just a bare path without /uploads/, try that too
  if (image.startsWith("/")) {
    const filepath = path.join(process.cwd(), "public", image);
    if (fs.existsSync(filepath)) {
      const buffer = fs.readFileSync(filepath);
      const ext = image.split(".").pop()?.toLowerCase() || "jpg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }
  }

  console.log("[resolveImage] Unresolvable:", image.substring(0, 80));
  return image;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      params,
      image,
      lastFrame,
      audioUrl,
      videoClip,
      groupName,
      parentId,
      promptId: inputPromptId,
    }: {
      params: KlingParams;
      image?: string;
      lastFrame?: string;
      audioUrl?: string;
      videoClip?: string;
      groupName?: string;
      parentId?: string;
      promptId?: string;
    } = body;

    const db = getDb();
    const settings = loadSettings(db);
    const provider: ProviderId = settings.provider || "kling-official";

    let taskId: string;

    if (provider === "dashscope") {
      if (!settings.dashscope_api_key) {
        return NextResponse.json(
          { error: "请先在设置中配置百炼 API Key" },
          { status: 400 }
        );
      }
      // Resolve images to base64 for local files
      const resolvedImage = image ? resolveImage(db, image) : undefined;
      const resolvedLastFrame = lastFrame ? resolveImage(db, lastFrame) : undefined;
      taskId = await dashscopeSubmit(
        settings.dashscope_api_key,
        params,
        resolvedImage,
        settings.dashscope_base_url || undefined,
        { lastFrame: resolvedLastFrame, audioUrl, videoClip }
      );
    } else {
      if (!settings.kling_access_key || !settings.kling_secret_key) {
        return NextResponse.json(
          { error: "请先在设置中配置可灵 API Keys" },
          { status: 400 }
        );
      }
      const token = generateToken(
        settings.kling_access_key,
        settings.kling_secret_key
      );
      if (image) {
        const imgParams: KlingImageParams = { ...params, image };
        taskId = await submitImage2Video(token, imgParams);
      } else {
        taskId = await submitText2Video(token, params);
      }
    }

    // Save or update prompt record
    const generationId = uuidv4();
    let promptId: string;

    if (inputPromptId) {
      // Iterating on an existing prompt — update it with latest params
      promptId = inputPromptId;
      db.prepare(
        `UPDATE prompts SET prompt=?, negative_prompt=?, model_name=?, mode=?, duration=?, aspect_ratio=?, cfg_scale=?, reference_image=?, group_name=?
         WHERE id=?`
      ).run(
        params.prompt,
        params.negative_prompt || "",
        params.model_name,
        params.mode,
        params.duration,
        params.aspect_ratio,
        params.cfg_scale,
        image || null,
        groupName || "",
        promptId
      );
    } else {
      // New prompt — insert fresh record
      promptId = uuidv4();
      db.prepare(
        `INSERT INTO prompts (id, prompt, negative_prompt, model_name, mode, duration, aspect_ratio, cfg_scale, reference_image, group_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        promptId,
        params.prompt,
        params.negative_prompt || "",
        params.model_name,
        params.mode,
        params.duration,
        params.aspect_ratio,
        params.cfg_scale,
        image || null,
        groupName || ""
      );
    }

    db.prepare(
      `INSERT INTO generations (id, prompt_id, task_id, task_status)
       VALUES (?, ?, ?, 'submitted')`
    ).run(generationId, promptId, taskId);

    // Create version record
    const versionId = uuidv4();
    db.prepare(
      `INSERT INTO prompt_versions (id, parent_id, prompt_id, prompt, negative_prompt, model_name, mode, duration, aspect_ratio, cfg_scale, reference_image, task_id, task_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`
    ).run(
      versionId,
      parentId || "",
      promptId,
      params.prompt,
      params.negative_prompt || "",
      params.model_name,
      params.mode,
      params.duration,
      params.aspect_ratio,
      params.cfg_scale,
      image || null,
      taskId
    );

    return NextResponse.json({ taskId, promptId, generationId, versionId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function loadSettings(db: ReturnType<typeof getDb>): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    provider: (map.provider as ProviderId) || "kling-official",
    kling_access_key: map.kling_access_key || "",
    kling_secret_key: map.kling_secret_key || "",
    dashscope_api_key: map.dashscope_api_key || "",
    dashscope_base_url: map.dashscope_base_url || "",
    llm_provider: (map.llm_provider as AppSettings["llm_provider"]) || "openai",
    llm_api_key: map.llm_api_key || "",
    llm_base_url: map.llm_base_url || "",
    llm_model: map.llm_model || "gpt-4o-mini",
  };
}
