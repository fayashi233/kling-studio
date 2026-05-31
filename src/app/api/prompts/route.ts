import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  const db = getDb();
  const group = req.nextUrl.searchParams.get("group");
  let prompts;
  if (group) {
    prompts = db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM prompt_versions pv WHERE pv.prompt_id = p.id) as version_count
         FROM prompts p WHERE p.group_name = ? ORDER BY p.created_at DESC`
      )
      .all(group);
  } else {
    prompts = db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM prompt_versions pv WHERE pv.prompt_id = p.id) as version_count
         FROM prompts p ORDER BY p.created_at DESC`
      )
      .all();
  }
  return NextResponse.json(prompts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = uuidv4();

  db.prepare(
    `INSERT INTO prompts (id, prompt, negative_prompt, model_name, mode, duration, aspect_ratio, cfg_scale, reference_image, is_favorite, tags, group_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.prompt,
    body.negative_prompt || "",
    body.model_name || "kling-v2-master",
    body.mode || "std",
    body.duration || "5",
    body.aspect_ratio || "16:9",
    body.cfg_scale ?? 0.5,
    body.reference_image || null,
    body.is_favorite ? 1 : 0,
    body.tags || "",
    body.group_name || ""
  );

  return NextResponse.json({ id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  const allowedKeys = [
    "prompt", "negative_prompt", "model_name", "mode", "duration",
    "aspect_ratio", "cfg_scale", "reference_image", "tags", "group_name",
  ];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedKeys.includes(key)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
    if (key === "is_favorite") {
      setClauses.push("is_favorite = ?");
      values.push(value ? 1 : 0);
    }
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  values.push(id);
  db.prepare(`UPDATE prompts SET ${setClauses.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const db = getDb();
  db.prepare("DELETE FROM generations WHERE prompt_id = ?").run(id);
  db.prepare("DELETE FROM prompts WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
