export interface ExportCodeSource {
  task_id: string;
  export_view_type?: string | null;
  export_scene_type?: string | null;
  export_case_type?: string | null;
  video_code?: string | null;
}

export interface ExportCodes {
  video_code: string;
  first_frame_code: string;
  last_frame_code: string;
}

export function viewPrefix(view: string) {
  return view.trim() === "wayside view" ? "W" : "V";
}

export function codeCaseType(caseType: string) {
  const trimmed = caseType.trim();
  return trimmed.endsWith("_case") ? trimmed.slice(0, -"_case".length) : trimmed;
}

export function canGenerateExportCode(row: ExportCodeSource) {
  return !!row.export_view_type?.trim() && !!row.export_scene_type?.trim() && !!row.export_case_type?.trim();
}

export function buildExportCode(
  row: ExportCodeSource,
  sequence: number
): ExportCodes {
  const videoCode = [
    viewPrefix(row.export_view_type || ""),
    (row.export_scene_type || "").trim(),
    codeCaseType(row.export_case_type || ""),
    String(sequence).padStart(2, "0"),
  ].join("-");

  return {
    video_code: videoCode,
    first_frame_code: `${videoCode}_FF`,
    last_frame_code: `${videoCode}_LF`,
  };
}

export function generateExportCodesForRows<T extends ExportCodeSource>(
  rows: T[],
  options: { overwriteExisting?: boolean } = {}
): Array<T & ExportCodes> {
  const counters = new Map<string, number>();
  return rows.map((row) => {
    const view = row.export_view_type?.trim() || "";
    const scene = row.export_scene_type?.trim() || "";
    const caseType = row.export_case_type?.trim() || "";
    if (!view || !scene || !caseType) {
      return {
        ...row,
        video_code: row.video_code || "",
        first_frame_code: row.video_code ? `${row.video_code}_FF` : "",
        last_frame_code: row.video_code ? `${row.video_code}_LF` : "",
      };
    }

    if (!options.overwriteExisting && row.video_code?.trim()) {
      return {
        ...row,
        video_code: row.video_code,
        first_frame_code: `${row.video_code}_FF`,
        last_frame_code: `${row.video_code}_LF`,
      };
    }

    const key = `${view}\u0000${scene}\u0000${caseType}`;
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    return { ...row, ...buildExportCode(row, next) };
  });
}
