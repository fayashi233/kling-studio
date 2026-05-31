import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { AppSettings } from "@/types";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const body: Partial<AppSettings> = await req.json();
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) {
      stmt.run(key, String(value));
    }
  }
  return NextResponse.json({ ok: true });
}
