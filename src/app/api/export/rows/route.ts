import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateExportCodesForRows } from "@/lib/exportCodes";

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

const EXPORT_ROWS_SQL = `
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
  `;

type ExportRow = {
  task_id: string;
  export_view_type: string;
  export_scene_type: string;
  export_case_type: string;
  video_code: string;
  first_frame_code: string;
  last_frame_code: string;
};

function backfillMissingCodes(db: ReturnType<typeof getDb>, overwriteExisting = false) {
  const rows = db.prepare(EXPORT_ROWS_SQL).all() as ExportRow[];
  const generated = generateExportCodesForRows(rows, { overwriteExisting });
  const update = db.prepare(`
    UPDATE generations
    SET video_code = ?, first_frame_code = ?, last_frame_code = ?
    WHERE task_id = ?
  `);
  const tx = db.transaction(() => {
    for (const row of generated) {
      const current = rows.find((item) => item.task_id === row.task_id);
      if (!current) continue;
      const changed =
        current.video_code !== row.video_code ||
        current.first_frame_code !== row.first_frame_code ||
        current.last_frame_code !== row.last_frame_code;
      if (changed) {
        update.run(row.video_code, row.first_frame_code, row.last_frame_code, row.task_id);
      }
    }
  });
  tx();
}

export async function GET() {
  const db = getDb();
  backfillMissingCodes(db);
  const rows = db.prepare(EXPORT_ROWS_SQL).all();
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
    let shouldRegenerateCodes = false;
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
            if (key === "export_view_type" || key === "export_scene_type" || key === "export_case_type") {
              shouldRegenerateCodes = true;
            }
          }
        }
        if (setClauses.length === 0) continue;
        values.push(taskId);
        db.prepare(`UPDATE generations SET ${setClauses.join(", ")} WHERE task_id = ?`).run(...values);
        updated.push(taskId);
      }
    });
    tx();
    if (shouldRegenerateCodes) backfillMissingCodes(db, true);

    return NextResponse.json({ ok: true, updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
