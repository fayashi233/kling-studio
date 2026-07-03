import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateExportCodesForRows } from "@/lib/exportCodes";

const ALLOWED = [
  "export_view_type",
  "export_scene_type",
  "export_case_type",
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

const EXPORT_ORDER_SQL = `
  SELECT
    g.task_id,
    COALESCE(g.export_view_type, '') as export_view_type,
    COALESCE(g.export_scene_type, '') as export_scene_type,
    COALESCE(g.export_case_type, '') as export_case_type,
    COALESCE(g.video_code, '') as video_code
  FROM generations g
  JOIN prompts p ON p.id = g.prompt_id
  ORDER BY
    CASE WHEN p.group_name IS NULL OR p.group_name = '' THEN '未分组' ELSE p.group_name END ASC,
    g.created_at DESC
`;

function regenerateCodes(db: ReturnType<typeof getDb>) {
  const rows = db.prepare(EXPORT_ORDER_SQL).all() as Array<{
    task_id: string;
    export_view_type: string;
    export_scene_type: string;
    export_case_type: string;
    video_code: string;
  }>;
  const generated = generateExportCodesForRows(rows, { overwriteExisting: true });
  const update = db.prepare(`
    UPDATE generations
    SET video_code = ?, first_frame_code = ?, last_frame_code = ?
    WHERE task_id = ?
  `);
  const tx = db.transaction(() => {
    for (const row of generated) {
      update.run(row.video_code, row.first_frame_code, row.last_frame_code, row.task_id);
    }
  });
  tx();
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const taskId = String(body.taskId || "");
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

    const setClauses: string[] = [];
    const values: string[] = [];
    let shouldRegenerateCodes = false;
    for (const key of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        setClauses.push(`${key} = ?`);
        values.push(String(body[key] ?? ""));
        if (key === "export_view_type" || key === "export_scene_type" || key === "export_case_type") {
          shouldRegenerateCodes = true;
        }
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No metadata updates" }, { status: 400 });
    }

    const db = getDb();
    values.push(taskId);
    db.prepare(`UPDATE generations SET ${setClauses.join(", ")} WHERE task_id = ?`).run(...values);
    if (shouldRegenerateCodes) regenerateCodes(db);

    const row = db.prepare("SELECT * FROM generations WHERE task_id = ?").get(taskId);
    return NextResponse.json({ ok: true, generation: row });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
