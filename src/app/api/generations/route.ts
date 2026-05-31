import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const generations = db
    .prepare("SELECT * FROM generations ORDER BY created_at DESC LIMIT 200")
    .all();
  return NextResponse.json(generations);
}
