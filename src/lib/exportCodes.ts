export interface ExportCodeSource {
  task_id: string;
  export_view_type?: string | null;
  export_scene_type?: string | null;
  export_case_type?: string | null;
  video_code?: string | null;
  reference_image?: string | null;
  last_frame_image?: string | null;
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
  const sequenceText = String(sequence).padStart(2, "0");
  const videoCode = [
    viewPrefix(row.export_view_type || ""),
    (row.export_scene_type || "").trim(),
    codeCaseType(row.export_case_type || ""),
    sequenceText,
  ].join("-");

  return {
    video_code: videoCode,
    first_frame_code: row.reference_image ? `${sequenceText}_FF` : "",
    last_frame_code: row.last_frame_image ? `${sequenceText}_LF` : "",
  };
}

function imageKey(imageRef: string | null | undefined) {
  const trimmed = imageRef?.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return trimmed.slice(0, 96);
  try {
    const pathname = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? new URL(trimmed).pathname
      : trimmed.split("?")[0];
    const filename = pathname.split(/[\\/]/).filter(Boolean).pop();
    return filename ? decodeURIComponent(filename) : trimmed;
  } catch {
    const filename = trimmed.split("?")[0].split(/[\\/]/).filter(Boolean).pop();
    return filename || trimmed;
  }
}

function createFrameCodeMap(rows: ExportCodeSource[]) {
  const imageNumbers = new Map<string, string>();
  let next = 1;
  const take = (imageRef: string | null | undefined) => {
    const key = imageKey(imageRef);
    if (!key) return "";
    if (!imageNumbers.has(key)) {
      imageNumbers.set(key, String(next).padStart(2, "0"));
      next += 1;
    }
    return imageNumbers.get(key) || "";
  };

  for (const row of rows) {
    take(row.reference_image);
    take(row.last_frame_image);
  }

  return {
    first(row: ExportCodeSource) {
      const number = take(row.reference_image);
      return number ? `${number}_FF` : "";
    },
    last(row: ExportCodeSource) {
      const number = take(row.last_frame_image);
      return number ? `${number}_LF` : "";
    },
  };
}

export function generateExportCodesForRows<T extends ExportCodeSource>(
  rows: T[],
  options: { overwriteExisting?: boolean } = {}
): Array<T & ExportCodes> {
  const counters = new Map<string, number>();
  const frameCodes = createFrameCodeMap(rows);
  return rows.map((row) => {
    const view = row.export_view_type?.trim() || "";
    const scene = row.export_scene_type?.trim() || "";
    const caseType = row.export_case_type?.trim() || "";
    if (!view || !scene || !caseType) {
      return {
        ...row,
        video_code: row.video_code || "",
        first_frame_code: frameCodes.first(row),
        last_frame_code: frameCodes.last(row),
      };
    }

    if (!options.overwriteExisting && row.video_code?.trim()) {
      return {
        ...row,
        video_code: row.video_code,
        first_frame_code: frameCodes.first(row),
        last_frame_code: frameCodes.last(row),
      };
    }

    const key = `${view}\u0000${scene}\u0000${caseType}`;
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    return {
      ...row,
      ...buildExportCode(row, next),
      first_frame_code: frameCodes.first(row),
      last_frame_code: frameCodes.last(row),
    };
  });
}
