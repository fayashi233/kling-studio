import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const generations = db
    .prepare("SELECT * FROM generations ORDER BY created_at DESC LIMIT 200")
    .all();
  return NextResponse.json(generations);
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId } = body;
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const db = getDb();
    const allowed = [
      "quality",
      "reject_reason",
      "export_view_type",
      "export_scene_type",
      "export_case_type",
      "video_code",
      "first_frame_code",
      "last_frame_code",
      "original_image_code",
      "image_source",
      "image_tool",
      "video_tool",
      "usable",
      "issue_type",
      "issue_description",
      "export_tags",
      "export_selected",
      "exported_at",
      "export_batch_id",
    ];
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(body)) {
      if (allowed.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value ?? "");
      }
    }
    if (setClauses.length === 0) return NextResponse.json({ ok: true });

    values.push(taskId);
    db.prepare(`UPDATE generations SET ${setClauses.join(", ")} WHERE task_id = ?`).run(...values);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
