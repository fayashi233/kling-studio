import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const { url, taskId } = await req.json();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

    const videosDir = path.join(process.cwd(), "public", "videos");
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
    }

    const filename = `${taskId || Date.now()}.mp4`;
    const filepath = path.join(videosDir, filename);

    // Download video
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `Download failed: ${res.statusText}` }, { status: 500 });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    // Update DB record
    const localPath = `/videos/${filename}`;
    if (taskId) {
      const db = getDb();
      db.prepare("UPDATE generations SET video_url = ? WHERE task_id = ?").run(localPath, taskId);
    }

    console.log(`[VideoSave] Saved ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

    return NextResponse.json({ ok: true, path: localPath, size: buffer.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
