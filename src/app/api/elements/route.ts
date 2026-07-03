import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateToken, createElement, pollElementTask, listElements, deleteElement } from "@/lib/kling";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import type { AppSettings, ProviderId } from "@/types";

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

function fileToBase64(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function GET() {
  const db = getDb();
  // Read all locally stored elements
  const localElements = db
    .prepare("SELECT id, api_element_id, name, cover_url, description, tag, provider, created_at FROM elements ORDER BY created_at DESC")
    .all();

  // Also try fetching from Kling API to sync
  try {
    const settings = loadSettings(db);
    if (settings.provider === "kling-official" && settings.kling_access_key && settings.kling_secret_key) {
      const token = generateToken(settings.kling_access_key.trim(), settings.kling_secret_key.trim());
      const remoteElements = await listElements(token);
      // Merge remote elements into local DB
      const insertStmt = db.prepare(
        "INSERT OR IGNORE INTO elements (id, api_element_id, name, cover_url, description, tag, provider) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      for (const el of remoteElements) {
        const coverUrl = el.cover?.resource || "";
        insertStmt.run(
          uuidv4(),
          String(el.element_id),
          el.element_name,
          coverUrl,
          el.element_description || "",
          "",
          "kling-official"
        );
      }
    }
  } catch { /* sync is best-effort */ }

  // Re-read after sync
  const elements = db
    .prepare("SELECT id, api_element_id, name, cover_url, description, tag, provider, created_at FROM elements ORDER BY created_at DESC")
    .all();
  return NextResponse.json(elements);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const url = formData.get("url") as string | null;
    const name = (formData.get("name") as string) || "未命名主体";
    const tag = (formData.get("tag") as string) || "";
    const description = (formData.get("description") as string) || "";
    const manualId = formData.get("manual_id") as string | null;

    const db = getDb();
    const settings = loadSettings(db);

    // Manual ID path (for DashScope or pre-created elements)
    if (manualId) {
      const id = uuidv4();
      db.prepare(
        "INSERT INTO elements (id, api_element_id, name, cover_url, description, tag, provider) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, String(manualId.trim()), name, url || "", description, tag, settings.provider);
      return NextResponse.json({ id, api_element_id: manualId.trim(), name });
    }

    // Kling official: create element via API
    if (settings.provider !== "kling-official") {
      return NextResponse.json(
        { error: "当前 provider 不支持自动创建主体，请手动输入主体 ID" },
        { status: 400 }
      );
    }

    const accessKey = (settings.kling_access_key || "").trim();
    const secretKey = (settings.kling_secret_key || "").trim();
    if (!accessKey || !secretKey) {
      return NextResponse.json(
        { error: "请先在设置中配置可灵 API Keys" },
        { status: 400 }
      );
    }

    // Resolve image to base64
    let coverUrl: string;
    let coverBase64: string;
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${uuidv4()}.${ext}`;
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      coverUrl = `/uploads/${filename}`;
      const mime = file.type || "image/jpeg";
      coverBase64 = fileToBase64(buffer, mime);
    } else if (url) {
      coverUrl = url;
      // If it's already a local upload, resolve to base64
      if (url.startsWith("/uploads/")) {
        const filepath = path.join(process.cwd(), "public", url);
        if (fs.existsSync(filepath)) {
          const buffer = fs.readFileSync(filepath);
          const ext = url.split(".").pop()?.toLowerCase() || "jpg";
          const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          coverBase64 = fileToBase64(buffer, mime);
        } else {
          coverBase64 = url; // pass URL as-is (Kling accepts URLs)
        }
      } else {
        coverBase64 = url;
      }
    } else {
      return NextResponse.json({ error: "请上传主体图片或提供 URL" }, { status: 400 });
    }

    // Strip data URI prefix — Kling expects raw base64
    const frontalImage = coverBase64.startsWith("data:")
      ? coverBase64.substring(coverBase64.indexOf("base64,") + 7)
      : coverBase64;

    const token = generateToken(accessKey, secretKey);

    // Submit creation task — Kling requires 1-3 refer_images
    const { taskId } = await createElement(token, {
      element_name: name.substring(0, 20),
      element_description: description || name,
      reference_type: "image_refer",
      element_image_list: {
        frontal_image: frontalImage,
        refer_images: [{ image_url: frontalImage }],
      },
    });

    // Poll until complete
    const result = await pollElementTask(token, taskId);

    // Save to local DB
    const localId = uuidv4();
    const resultCoverUrl = result.cover?.resource || coverUrl;
    db.prepare(
      "INSERT INTO elements (id, api_element_id, name, cover_url, description, tag, provider) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(localId, String(result.element_id), result.element_name, resultCoverUrl, result.element_description || description, tag, "kling-official");

    return NextResponse.json({
      id: localId,
      api_element_id: String(result.element_id),
      name: result.element_name,
      cover_url: resultCoverUrl,
      description: result.element_description,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = getDb();
    const el = db.prepare("SELECT api_element_id, provider FROM elements WHERE id = ?").get(id) as
      | { api_element_id: string; provider: string } | undefined;
    if (!el) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Try to delete from Kling API (only for kling-official elements)
    if (el.provider === "kling-official") {
      try {
        const settings = loadSettings(db);
        const accessKey = (settings.kling_access_key || "").trim();
        const secretKey = (settings.kling_secret_key || "").trim();
        if (accessKey && secretKey) {
          const token = generateToken(accessKey, secretKey);
          await deleteElement(token, el.api_element_id);
        }
      } catch { /* Kling API delete failed — still remove from local DB */ }
    }

    db.prepare("DELETE FROM elements WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}
