import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateToken, getTaskStatus } from "@/lib/kling";
import { dashscopeStatus } from "@/lib/dashscope";
import type { AppSettings, ProviderId } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const db = getDb();
    const settings = loadSettings(db);
    const provider: ProviderId = settings.provider || "kling-official";

    let result;

    if (provider === "dashscope") {
      if (!settings.dashscope_api_key) {
        return NextResponse.json(
          { error: "API key not configured" },
          { status: 400 }
        );
      }
      result = await dashscopeStatus(
        settings.dashscope_api_key,
        taskId,
        settings.dashscope_base_url || undefined
      );
    } else {
      if (!settings.kling_access_key || !settings.kling_secret_key) {
        return NextResponse.json(
          { error: "API keys not configured" },
          { status: 400 }
        );
      }
      const token = generateToken(
        settings.kling_access_key,
        settings.kling_secret_key
      );
      result = await getTaskStatus(token, taskId);
    }

    // Update DB
    if (result.task_status === "succeed" && result.task_result?.videos?.[0]) {
      const videoUrl = result.task_result.videos[0].url;
      db.prepare(`UPDATE generations SET task_status = 'succeed', video_url = ? WHERE task_id = ?`).run(videoUrl, taskId);
      db.prepare(`UPDATE prompt_versions SET task_status = 'succeed', video_url = ? WHERE task_id = ?`).run(videoUrl, taskId);
    } else if (result.task_status === "failed") {
      const errMsg = result.task_status_msg || "Unknown error";
      db.prepare(`UPDATE generations SET task_status = 'failed', error_msg = ? WHERE task_id = ?`).run(errMsg, taskId);
      db.prepare(`UPDATE prompt_versions SET task_status = 'failed' WHERE task_id = ?`).run(taskId);
    } else {
      db.prepare(`UPDATE generations SET task_status = ? WHERE task_id = ?`).run(result.task_status, taskId);
      db.prepare(`UPDATE prompt_versions SET task_status = ? WHERE task_id = ?`).run(result.task_status, taskId);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function loadSettings(db: ReturnType<typeof getDb>): AppSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    provider: (map.provider as ProviderId) || "kling-official",
    kling_access_key: map.kling_access_key || "",
    kling_secret_key: map.kling_secret_key || "",
    dashscope_api_key: map.dashscope_api_key || "",
    dashscope_base_url: map.dashscope_base_url || "",
    llm_provider: (map.llm_provider as AppSettings["llm_provider"]) || "openai",
    llm_api_key: map.llm_api_key || "",
    llm_base_url: map.llm_base_url || "",
    llm_model: map.llm_model || "gpt-4o-mini",
  };
}
