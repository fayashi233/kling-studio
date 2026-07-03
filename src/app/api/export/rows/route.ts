import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const EDITABLE = [
  "export_selected",
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
] as const;

export async function GET() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      g.*,
      p.prompt,
      p.group_name,
      p.reference_image,
      p.last_frame_image
    FROM generations g
    JOIN prompts p ON p.id = g.prompt_id
    ORDER BY
      CASE WHEN p.group_name IS NULL OR p.group_name = '' THEN '未分组' ELSE p.group_name END ASC,
      g.created_at DESC
  `).all();
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "rows required" }, { status: 400 });
    }

    const db = getDb();
    const updated: string[] = [];
    const tx = db.transaction(() => {
      for (const row of rows) {
        const taskId = String(row.task_id || row.taskId || "");
        if (!taskId) continue;
        const setClauses: string[] = [];
        const values: unknown[] = [];
        for (const key of EDITABLE) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            setClauses.push(`${key} = ?`);
            values.push(key === "export_selected" ? (row[key] ? 1 : 0) : String(row[key] ?? ""));
          }
        }
        if (setClauses.length === 0) continue;
        values.push(taskId);
        db.prepare(`UPDATE generations SET ${setClauses.join(", ")} WHERE task_id = ?`).run(...values);
        updated.push(taskId);
      }
    });
    tx();

    return NextResponse.json({ ok: true, updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
