import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

export async function GET() {
  const db = getDb();
  const images = db
    .prepare("SELECT id, path, label, created_at FROM images ORDER BY created_at DESC")
    .all();
  return NextResponse.json(images);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const url = formData.get("url") as string | null;
    const label = (formData.get("label") as string) || "";

    const db = getDb();
    const id = uuidv4();
    let imagePath: string;
    let base64Data = "";

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${id}.${ext}`;
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      imagePath = `/uploads/${filename}`;
      const mime = file.type || "image/jpeg";
      base64Data = `data:${mime};base64,${buffer.toString("base64")}`;
    } else if (url) {
      imagePath = url;
    } else {
      return NextResponse.json({ error: "No file or URL provided" }, { status: 400 });
    }

    db.prepare("INSERT INTO images (id, path, label, base64_data) VALUES (?, ?, ?, ?)")
      .run(id, imagePath, label, base64Data);

    return NextResponse.json({ id, path: imagePath, label, hasBase64: !!base64Data });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = getDb();
    const img = db.prepare("SELECT path FROM images WHERE id = ?").get(id) as { path: string } | undefined;
    if (!img) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Delete file from disk if it's a local upload
    if (img.path.startsWith("/uploads/")) {
      const filepath = path.join(process.cwd(), "public", img.path);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }

    db.prepare("DELETE FROM images WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

// Get base64 for a specific image
export async function PATCH(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  const img = db.prepare("SELECT base64_data, path FROM images WHERE id = ?").get(id) as
    | { base64_data: string; path: string } | undefined;
  if (!img) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (img.base64_data) return NextResponse.json({ base64: img.base64_data });

  if (img.path.startsWith("/uploads/")) {
    const filepath = path.join(process.cwd(), "public", img.path);
    if (fs.existsSync(filepath)) {
      const buffer = fs.readFileSync(filepath);
      const ext = img.path.split(".").pop()?.toLowerCase() || "jpg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const b64 = `data:${mime};base64,${buffer.toString("base64")}`;
      db.prepare("UPDATE images SET base64_data = ? WHERE id = ?").run(b64, id);
      return NextResponse.json({ base64: b64 });
    }
  }

  return NextResponse.json({ base64: null });
}
