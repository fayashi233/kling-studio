import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildVideoInfoText, type VideoInfoData } from "@/lib/videoInfo";
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
      db.prepare("UPDATE prompt_versions SET video_url = ? WHERE task_id = ?").run(localPath, taskId);
      const info = db.prepare(`
        SELECT
          p.prompt,
          p.negative_prompt,
          p.model_name,
          p.mode,
          p.duration,
          p.aspect_ratio,
          p.cfg_scale,
          p.reference_image,
          p.last_frame_image,
          g.task_id,
          g.task_status,
          g.video_url,
          g.export_view_type,
          g.export_scene_type,
          g.export_case_type,
          g.video_code,
          g.first_frame_code,
          g.last_frame_code,
          g.image_source,
          g.image_tool,
          g.video_tool,
          g.usable,
          g.issue_type,
          g.issue_description,
          g.export_tags,
          g.created_at
        FROM generations g
        JOIN prompts p ON p.id = g.prompt_id
        WHERE g.task_id = ?
      `).get(taskId) as VideoInfoData | undefined;
      fs.writeFileSync(
        path.join(videosDir, `${path.parse(filename).name}.txt`),
        buildVideoInfoText({ ...(info || {}), video_url: localPath }),
        "utf8"
      );
    }

    console.log(`[VideoSave] Saved ${filename} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

    return NextResponse.json({ ok: true, path: localPath, size: buffer.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
