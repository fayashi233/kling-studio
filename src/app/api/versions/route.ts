import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// List all versions (optionally filtered by prompt_id)
export async function GET(req: NextRequest) {
  const db = getDb();
  const promptId = req.nextUrl.searchParams.get("prompt_id");

  let versions;
  if (promptId) {
    versions = db
      .prepare(`SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at ASC`)
      .all(promptId);
  } else {
    versions = db
      .prepare(`SELECT * FROM prompt_versions ORDER BY created_at DESC LIMIT 200`)
      .all();
  }
  return NextResponse.json(versions);
}

// Create a new version
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO prompt_versions (id, parent_id, prompt_id, prompt, negative_prompt, model_name, mode, duration, aspect_ratio, cfg_scale, reference_image, task_id, video_url, task_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.parent_id || "",
      body.prompt_id || "",
      body.prompt,
      body.negative_prompt || "",
      body.model_name || "",
      body.mode || "",
      body.duration || "",
      body.aspect_ratio || "",
      body.cfg_scale ?? 0.5,
      body.reference_image || "",
      body.task_id || "",
      body.video_url || "",
      body.task_status || "submitted"
    );

    return NextResponse.json({ id });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

// Update a version (e.g., when video finishes)
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = getDb();
    const allowed = ["task_id", "video_url", "task_status"];
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (setClauses.length === 0) return NextResponse.json({ ok: true });

    values.push(id);
    db.prepare(`UPDATE prompt_versions SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}
