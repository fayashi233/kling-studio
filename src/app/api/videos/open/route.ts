import { NextResponse } from "next/server";
import path from "path";
import { exec } from "child_process";

export async function POST() {
  const dir = path.join(process.cwd(), "public", "videos");

  // Windows: explorer, macOS: open, Linux: xdg-open
  const cmd =
    process.platform === "win32"
      ? `explorer "${dir.replace(/\//g, "\\")}"`
      : process.platform === "darwin"
        ? `open "${dir}"`
        : `xdg-open "${dir}"`;

  exec(cmd);
  return NextResponse.json({ ok: true, path: dir });
}
