import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDb } from "@/lib/db";
import { createZip, type ZipEntry } from "@/lib/zip";
import { createSimpleXlsx } from "@/lib/xlsx";
import { v4 as uuidv4 } from "uuid";
import { buildVideoInfoText } from "@/lib/videoInfo";

const HEADERS = [
  "视频提示词",
  "视频编号",
  "首帧图片编号",
  "尾帧图片编号",
  "原图编号",
  "输入图片来源",
  "图片合成工具",
  "视频合成工具",
  "是否可用",
  "主要问题类型",
  "主要问题描述",
];

interface ExportRow {
  prompt: string;
  task_id: string;
  video_url: string | null;
  negative_prompt: string;
  model_name: string;
  mode: string;
  duration: string;
  aspect_ratio: string;
  cfg_scale: number;
  task_status: string;
  reference_image: string | null;
  last_frame_image: string | null;
  created_at: string;
  export_view_type: string;
  export_scene_type: string;
  export_case_type: string;
  video_code: string;
  first_frame_code: string;
  last_frame_code: string;
  original_image_code: string;
  image_source: string;
  image_tool: string;
  video_tool: string;
  usable: string;
  issue_type: string;
  issue_description: string;
}

function cleanSegment(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function localVideoPath(videoUrl: string | null): string | null {
  if (!videoUrl || !videoUrl.startsWith("/videos/")) return null;
  const file = videoUrl.replace(/^\/videos\//, "");
  return path.join(process.cwd(), "public", "videos", file);
}

function videoExtension(videoUrl: string | null): string {
  const ext = videoUrl ? path.extname(videoUrl.split("?")[0]) : "";
  return ext || ".mp4";
}

function buildQuery(scope: string, groupName: string, taskIds: string[]) {
  const base = `
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
      g.created_at,
      COALESCE(g.export_view_type, '') as export_view_type,
      COALESCE(g.export_scene_type, '') as export_scene_type,
      COALESCE(g.export_case_type, '') as export_case_type,
      COALESCE(g.video_code, '') as video_code,
      COALESCE(g.first_frame_code, '') as first_frame_code,
      COALESCE(g.last_frame_code, '') as last_frame_code,
      COALESCE(g.original_image_code, '') as original_image_code,
      COALESCE(g.image_source, '') as image_source,
      COALESCE(g.image_tool, '') as image_tool,
      COALESCE(g.video_tool, '可灵-api') as video_tool,
      COALESCE(g.usable, '') as usable,
      COALESCE(g.issue_type, '') as issue_type,
      COALESCE(g.issue_description, '') as issue_description
    FROM generations g
    JOIN prompts p ON p.id = g.prompt_id
  `;

  if (scope === "selected_task_ids" && taskIds.length > 0) {
    return {
      sql: `${base} WHERE g.task_id IN (${taskIds.map(() => "?").join(",")}) ORDER BY g.created_at DESC`,
      params: taskIds,
    };
  }

  if (taskIds.length > 0) {
    return {
      sql: `${base} WHERE g.task_id IN (${taskIds.map(() => "?").join(",")}) ORDER BY g.created_at DESC`,
      params: taskIds,
    };
  }

  if (scope === "current_group") {
    return {
      sql: `${base} WHERE p.group_name = ? ORDER BY g.created_at DESC`,
      params: [groupName],
    };
  }

  return {
    sql: `${base} WHERE g.export_selected = 1 ORDER BY g.created_at DESC`,
    params: [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const scope = String(body.scope || "all_usable");
    const groupName = String(body.groupName || "");
    const taskIds = Array.isArray(body.taskIds)
      ? body.taskIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (scope === "current_group" && !groupName) {
      return NextResponse.json({ error: "groupName required" }, { status: 400 });
    }
    const db = getDb();
    const query = buildQuery(scope, groupName, taskIds);
    const rows = db.prepare(query.sql).all(...query.params) as ExportRow[];

    const sheetRows = [
      HEADERS,
      ...rows.map((row) => [
        row.prompt,
        row.video_code,
        row.first_frame_code,
        row.last_frame_code,
        row.original_image_code,
        row.image_source,
        row.image_tool,
        row.video_tool || "可灵-api",
        row.usable,
        row.issue_type,
        row.issue_description,
      ]),
    ];

    const entries: ZipEntry[] = [
      { path: "可灵_视频提示词.xlsx", data: createSimpleXlsx(sheetRows) },
    ];
    const skipped: Array<{ taskId: string; reason: string }> = [];
    const exportedTaskIds: string[] = [];

    for (const row of rows) {
      const view = cleanSegment(row.export_view_type);
      const scene = cleanSegment(row.export_scene_type);
      const type = cleanSegment(row.export_case_type);
      const code = cleanSegment(row.video_code);
      if (!view || !scene || !type || !code) {
        skipped.push({ taskId: row.task_id, reason: "缺少目录分类或视频编号" });
        continue;
      }

      const source = localVideoPath(row.video_url);
      if (!source || !fs.existsSync(source)) {
        skipped.push({ taskId: row.task_id, reason: "缺少本地视频文件" });
        continue;
      }

      const videoPath = `${view}/${scene}/${type}/${code}${videoExtension(row.video_url)}`;
      entries.push({
        path: videoPath,
        data: fs.readFileSync(source),
      });
      entries.push({
        path: `${view}/${scene}/${type}/${code}.txt`,
        data: buildVideoInfoText(row),
      });
      exportedTaskIds.push(row.task_id);
    }

    const batchId = uuidv4();
    const exportedAt = new Date().toISOString();
    if (exportedTaskIds.length > 0) {
      db.prepare(
        `UPDATE generations
         SET exported_at = ?, export_batch_id = ?
         WHERE task_id IN (${exportedTaskIds.map(() => "?").join(",")})`
      ).run(exportedAt, batchId, ...exportedTaskIds);
    }

    entries.push({
      path: "export_summary.json",
      data: JSON.stringify({
        batchId,
        exportedAt,
        exportedRows: rows.length,
        videoFiles: exportedTaskIds.length,
        exportedTaskIds,
        skipped,
      }, null, 2),
    });

    const zip = createZip(entries);
    const filename = `kling_export_${new Date().toISOString().slice(0, 10)}.zip`;
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "X-Export-Rows": String(rows.length),
        "X-Export-Skipped": encodeURIComponent(JSON.stringify(skipped)),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
