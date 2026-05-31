import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseMarkdownPrompts } from "@/lib/markdown";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const { content, group_name } = (await req.json()) as {
      content: string;
      group_name?: string;
    };
    const imported = parseMarkdownPrompts(content);
    const db = getDb();

    const ids: string[] = [];
    for (const item of imported) {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO prompts (id, prompt, negative_prompt, model_name, mode, duration, aspect_ratio, cfg_scale, tags, group_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        item.prompt,
        item.negative_prompt || "",
        item.model_name || "kling-v2-master",
        item.mode || "std",
        item.duration || "5",
        item.aspect_ratio || "16:9",
        item.cfg_scale ?? 0.5,
        item.title || "",
        group_name || ""
      );
      ids.push(id);
    }

    return NextResponse.json({ imported: ids.length, ids });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
