import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const ALLOWED = [
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
] as const;

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const taskId = String(body.taskId || "");
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const setClauses: string[] = [];
    const values: string[] = [];
    for (const key of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        setClauses.push(`${key} = ?`);
        values.push(String(body[key] ?? ""));
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No metadata updates" }, { status: 400 });
    }

    const db = getDb();
    values.push(taskId);
    db.prepare(`UPDATE generations SET ${setClauses.join(", ")} WHERE task_id = ?`).run(...values);

    const row = db.prepare("SELECT * FROM generations WHERE task_id = ?").get(taskId);
    return NextResponse.json({ ok: true, generation: row });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
