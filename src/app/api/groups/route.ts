import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// List all groups with prompt counts
export async function GET() {
  const db = getDb();
  const groups = db
    .prepare(
      `SELECT group_name, COUNT(*) as count
       FROM prompts
       WHERE group_name != '' AND group_name IS NOT NULL
       GROUP BY group_name
       ORDER BY MAX(created_at) DESC`
    )
    .all() as Array<{ group_name: string; count: number }>;
  return NextResponse.json(groups);
}

// Rename a group
export async function PATCH(req: NextRequest) {
  const { oldName, newName } = await req.json();
  if (!oldName || !newName) {
    return NextResponse.json({ error: "oldName and newName required" }, { status: 400 });
  }
  const db = getDb();
  db.prepare("UPDATE prompts SET group_name = ? WHERE group_name = ?").run(newName, oldName);
  return NextResponse.json({ ok: true });
}

// Delete a group (removes group assignment, not prompts)
export async function DELETE(req: NextRequest) {
  const { name } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const db = getDb();
  db.prepare("UPDATE prompts SET group_name = '' WHERE group_name = ?").run(name);
  return NextResponse.json({ ok: true });
}
