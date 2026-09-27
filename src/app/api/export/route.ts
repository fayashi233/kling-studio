import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDb } from "@/lib/db";
import { createZipToFile, type ZipEntry } from "@/lib/zip";
import { createSimpleXlsx } from "@/lib/xlsx";
import { v4 as uuidv4 } from "uuid";
import { buildVideoInfoText } from "@/lib/videoInfo";
import { generateExportCodesForRows } from "@/lib/exportCodes";

const HEADERS = [
  "视频提示词",
  "视频编号",
  "首帧图片编号",
  "尾帧图片编号",
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
  image_source: string;
  image_tool: string;
  video_tool: string;
  usable: string;
  issue_type: string;
  issue_description: string;
}

const EXPORT_ORDER_SQL = `
  SELECT
    g.task_id,
    COALESCE(g.export_view_type, '') as export_view_type,
    COALESCE(g.export_scene_type, '') as export_scene_type,
    COALESCE(g.export_case_type, '') as export_case_type,
    COALESCE(g.video_code, '') as video_code,
    pv.reference_image,
    pv.last_frame_image
  FROM generations g
  JOIN prompts p ON p.id = g.prompt_id
  JOIN prompt_versions pv ON pv.task_id = g.task_id
  ORDER BY
    CASE WHEN p.group_name IS NULL OR p.group_name = '' THEN '未分组' ELSE p.group_name END ASC,
    g.created_at DESC
`;

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

function extensionFromMime(mime: string | null): string {
  const type = (mime || "").toLowerCase().split(";")[0].trim();
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  if (type === "image/bmp") return ".bmp";
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  return "";
}

function extensionFromImageRef(imageRef: string): string {
  try {
    const pathname = imageRef.startsWith("http://") || imageRef.startsWith("https://")
      ? new URL(imageRef).pathname
      : imageRef.split("?")[0];
    return path.extname(pathname).toLowerCase() || ".jpg";
  } catch {
    return ".jpg";
  }
}

async function readExportImage(imageRef: string): Promise<{ data: Buffer; ext: string }> {
  const trimmed = imageRef.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      data: Buffer.from(dataUrlMatch[2], "base64"),
      ext: extensionFromMime(dataUrlMatch[1]) || ".jpg",
    };
  }

  if (trimmed.startsWith("/uploads/")) {
    const localPath = path.join(process.cwd(), "public", trimmed.replace(/^\/+/, ""));
    if (!fs.existsSync(localPath)) throw new Error("本地图片文件不存在");
    return {
      data: fs.readFileSync(localPath),
      ext: path.extname(localPath).toLowerCase() || ".jpg",
    };
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error(`远程图片下载失败: ${res.status}`);
    return {
      data: Buffer.from(await res.arrayBuffer()),
      ext: extensionFromMime(res.headers.get("content-type")) || extensionFromImageRef(trimmed),
    };
  }

  throw new Error("不支持的图片路径");
}

function backfillMissingCodes(db: ReturnType<typeof getDb>) {
  const rows = db.prepare(EXPORT_ORDER_SQL).all() as Array<{
    task_id: string;
    export_view_type: string;
    export_scene_type: string;
    export_case_type: string;
    video_code: string;
    reference_image: string | null;
    last_frame_image: string | null;
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

function buildQuery(scope: string, groupName: string, taskIds: string[]) {
  const base = `
    SELECT
      pv.prompt,
      pv.negative_prompt,
      pv.model_name,
      pv.mode,
      pv.duration,
      pv.aspect_ratio,
      pv.cfg_scale,
      pv.reference_image,
      pv.last_frame_image,
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
      COALESCE(g.image_source, '') as image_source,
      COALESCE(g.image_tool, '') as image_tool,
      COALESCE(g.video_tool, '可灵-api') as video_tool,
      COALESCE(g.usable, '') as usable,
      COALESCE(g.issue_type, '') as issue_type,
      COALESCE(g.issue_description, '') as issue_description
    FROM generations g
    JOIN prompts p ON p.id = g.prompt_id
    JOIN prompt_versions pv ON pv.task_id = g.task_id
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
    backfillMissingCodes(db);
    const query = buildQuery(scope, groupName, taskIds);
    const rows = db.prepare(query.sql).all(...query.params) as ExportRow[];

    // Build output path: output/kling_export_2026-07-03_14-30-00.zip
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
    const outputDir = path.join(process.cwd(), "output");
    const outputPath = path.join(outputDir, `kling_export_${ts}.zip`);

    const sheetRows = [
      HEADERS,
      ...rows.map((row) => [
        row.prompt,
        row.video_code,
        row.first_frame_code,
        row.last_frame_code,
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
    const imageSkipped: Array<{ taskId: string; code: string; image: "first" | "last"; reason: string }> = [];
    const exportedTaskIds: string[] = [];
    let imageFiles = 0;

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
        data: Buffer.alloc(0),
        sourceFile: source,
      });
      entries.push({
        path: `${view}/${scene}/${type}/${code}.txt`,
        data: buildVideoInfoText(row),
      });
      const folder = `${view}/${scene}/${type}`;
      const imageJobs: Array<{ image: "first" | "last"; code: string; ref: string | null }> = [
        { image: "first", code: cleanSegment(row.first_frame_code), ref: row.reference_image },
        { image: "last", code: cleanSegment(row.last_frame_code), ref: row.last_frame_image },
      ];
      for (const job of imageJobs) {
        if (!job.ref || !job.code) continue;
        try {
          const image = await readExportImage(job.ref);
          entries.push({
            path: `${folder}/${job.code}${image.ext}`,
            data: image.data,
          });
          imageFiles += 1;
        } catch (err) {
          imageSkipped.push({
            taskId: row.task_id,
            code: job.code,
            image: job.image,
            reason: err instanceof Error ? err.message : "图片导出失败",
          });
        }
      }
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
        imageFiles,
        exportedTaskIds,
        skipped,
        imageSkipped,
      }, null, 2),
    });

    const zip = createZipToFile(
      entries,
      outputPath
    );

    const filename = path.basename(outputPath);
    return NextResponse.json({
      ok: true,
      filePath: outputPath,
      filename,
      fileSize: zip.fileSize,
      exportedCount: exportedTaskIds.length,
      skipped: skipped.length > 0 ? skipped : undefined,
      imageSkipped: imageSkipped.length > 0 ? imageSkipped : undefined,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
