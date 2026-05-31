import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { expandPrompt, optimizePrompt, generateVariants } from "@/lib/llm";
import type { AppSettings } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { action, prompt, count, lang } = (await req.json()) as {
      action: "expand" | "optimize" | "variants";
      prompt: string;
      count?: number;
      lang?: string;
    };

    const db = getDb();
    const settings = loadSettings(db);
    if (!settings.llm_api_key) {
      return NextResponse.json(
        { error: "请先在设置中配置 LLM API Key" },
        { status: 400 }
      );
    }

    const language = lang || "en";

    let result: string | string[];
    switch (action) {
      case "expand":
        result = await expandPrompt(settings, prompt, language);
        break;
      case "optimize":
        result = await optimizePrompt(settings, prompt, language);
        break;
      case "variants":
        result = await generateVariants(settings, prompt, count || 3, language);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ result });
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
    provider: (map.provider as AppSettings["provider"]) || "kling-official",
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
