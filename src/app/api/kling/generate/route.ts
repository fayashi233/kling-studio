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
 *  Throws if the image cannot be resolved to usable form.
 */
function resolveImage(db: ReturnType<typeof getDb>, image: string): string {
  if (image.startsWith("data:")) {
    // Validate that it actually contains base64 data
    if (image.includes("base64,")) return image;
    // data URI without base64 encoding — still a valid image format
    return image;
  }
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
      // Cache for next time (upsert: update if exists, insert if not)
      const existing = db.prepare("SELECT id FROM images WHERE path = ?").get(image) as { id: string } | undefined;
      if (existing) {
        db.prepare("UPDATE images SET base64_data = ? WHERE path = ?").run(b64, image);
      } else {
        db.prepare("INSERT INTO images (id, path, base64_data) VALUES (?, ?, ?)").run(uuidv4(), image, b64);
      }
      return b64;
    }

    console.log("[resolveImage] File not found:", filepath);
    throw new Error(
      `图片文件不存在: ${filepath}。请重新上传图片后再试。`
    );
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
    throw new Error(
      `图片文件不存在: ${filepath}。请重新上传图片后再试。`
    );
  }

  // Not a data URI, not a URL, not a local path — don't know how to handle
  console.log("[resolveImage] Unresolvable:", image.substring(0, 80));
  throw new Error(
    `无法解析图片: "${image.substring(0, 80)}"。图片必须是 base64 data URI、远程 URL 或本地 /uploads/ 路径。`
  );
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
      elementIds,
      groupName,
      parentId,
      promptId: inputPromptId,
    }: {
      params: KlingParams;
      image?: string;
      lastFrame?: string;
      audioUrl?: string;
      videoClip?: string;
      elementIds?: string[];
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
        { lastFrame: resolvedLastFrame, audioUrl, videoClip, elementIds }
      );
    } else {
      const accessKey = (settings.kling_access_key || "").trim();
      const secretKey = (settings.kling_secret_key || "").trim();
      if (!accessKey || !secretKey) {
        return NextResponse.json(
          { error: "请先在设置中配置可灵 API Keys" },
          { status: 400 }
        );
      }
      const token = generateToken(accessKey, secretKey);
      // Build extra params for elements
      const extraParams: Record<string, unknown> = {};
      if (elementIds && elementIds.length > 0) {
        extraParams.element_list = elementIds.map((eid) => ({ element_id: String(eid).replace(/\.0+$/, "") }));
      }
      if (image) {
        // Resolve local paths to base64; strip data URI prefix since Kling expects raw base64
        const resolved = resolveImage(db, image);
        const klingImage = resolved.startsWith("data:")
          ? resolved.substring(resolved.indexOf("base64,") + "base64,".length)
          : resolved;
        // Validate: Kling API requires valid base64 or a URL
        if (!/^[A-Za-z0-9+/=]+$/.test(klingImage) && !klingImage.startsWith("http")) {
          throw new Error(
            `图片格式无效: Kling API 需要 base64 编码或远程 URL，但得到了 "${klingImage.substring(0, 80)}"`
          );
        }
        const imgParams: KlingImageParams = { ...params, image: klingImage, ...extraParams };
        // Handle last frame (image_tail)
        if (lastFrame) {
          const resolvedTail = resolveImage(db, lastFrame);
          imgParams.image_tail = resolvedTail.startsWith("data:")
            ? resolvedTail.substring(resolvedTail.indexOf("base64,") + "base64,".length)
            : resolvedTail;
          // Validate tail image too
          if (imgParams.image_tail && !/^[A-Za-z0-9+/=]+$/.test(imgParams.image_tail) && !imgParams.image_tail.startsWith("http")) {
            throw new Error(
              `尾帧图片格式无效: Kling API 需要 base64 编码或远程 URL，但得到了 "${imgParams.image_tail.substring(0, 80)}"`
            );
          }
        }
        taskId = await submitImage2Video(token, imgParams);
      } else {
        taskId = await submitText2Video(token, { ...params, ...extraParams });
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

    const taskType = image ? "image2video" : "text2video";

    db.prepare(
      `INSERT INTO generations (id, prompt_id, task_id, task_type, task_status)
       VALUES (?, ?, ?, ?, 'submitted')`
    ).run(generationId, promptId, taskId, taskType);

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
    const authFailed = message.includes("(401)") || message.includes("Auth failed");
    return NextResponse.json(
      {
        error: authFailed
          ? "可灵 API 鉴权失败 (401)，请检查 Access Key 和 Secret Key 是否正确、是否已过期"
          : message,
      },
      { status: authFailed ? 401 : 500 }
    );
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
