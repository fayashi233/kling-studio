import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateToken, createElement, listElements, deleteElement } from "@/lib/kling";
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

function resolveToBase64(image: string): string {
  if (image.startsWith("data:")) return image;
  if (image.startsWith("/uploads/")) {
    const filepath = path.join(process.cwd(), "public", image);
    if (fs.existsSync(filepath)) {
      const buffer = fs.readFileSync(filepath);
      const ext = image.split(".").pop()?.toLowerCase() || "jpg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }
  }
  return image;
}

export async function GET() {
  const db = getDb();
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
      ).run(id, manualId.trim(), name, url || "", description, tag, settings.provider);
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

    // Resolve image
    let coverImage: string;
    let coverUrl: string;
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${uuidv4()}.${ext}`;
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      coverUrl = `/uploads/${filename}`;
      const mime = file.type || "image/jpeg";
      coverImage = `data:${mime};base64,${buffer.toString("base64")}`;
    } else if (url) {
      coverUrl = url;
      coverImage = resolveToBase64(url);
    } else {
      return NextResponse.json({ error: "请上传主体图片或提供 URL" }, { status: 400 });
    }

    // Strip data URI prefix — Kling API expects raw base64
    const rawBase64 = coverImage.startsWith("data:")
      ? coverImage.substring(coverImage.indexOf("base64,") + "base64,".length)
      : coverImage;

    const token = generateToken(accessKey, secretKey);
    const result = await createElement(token, {
      name: name.substring(0, 15),
      coverImage: rawBase64,
      tag: tag || undefined,
      description: description || undefined,
    });

    const localId = uuidv4();
    db.prepare(
      "INSERT INTO elements (id, api_element_id, name, cover_url, description, tag, provider) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(localId, result.id, result.name, result.cover?.resource || coverUrl, result.description || description, tag, "kling-official");

    return NextResponse.json({
      id: localId,
      api_element_id: result.id,
      name: result.name,
      cover_url: result.cover?.resource || coverUrl,
      description: result.description,
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
