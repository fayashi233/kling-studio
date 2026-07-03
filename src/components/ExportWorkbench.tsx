"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateExportCodesForRows } from "@/lib/exportCodes";

export interface ExportTableRow {
  id: string;
  prompt_id: string;
  task_id: string;
  task_status: string;
  video_url: string | null;
  prompt: string;
  group_name: string;
  reference_image: string | null;
  last_frame_image: string | null;
  export_selected: number;
  exported_at: string;
  export_batch_id: string;
  export_view_type: string;
  export_scene_type: string;
  export_case_type: string;
  video_code: string;
  first_frame_code: string;
  last_frame_code: string;
  image_source: string;
  image_tool: string;
  video_tool: string;
  usable: string;
  issue_type: string;
  issue_description: string;
  export_tags: string;
}

type FilterMode = "all" | "exported" | "unexported";

const VIEW_OPTIONS = ["vehicle view", "wayside view"];
const SCENE_OPTIONS = ["Bridges", "Section-区间", "station", "terminal", "Tunnel"];
const CASE_OPTIONS = [
  "people_intrusion_case",
  "tree_intrusion_case",
  "cow_intrusion_case",
  "rock_intrusion_case",
  "fire_intrusion_case",
  "box_intrusion_case",
  "car_intrusion_case",
];

const EDITABLE_FIELDS: Array<keyof ExportTableRow> = [
  "image_source",
  "image_tool",
  "video_tool",
  "usable",
  "issue_type",
  "issue_description",
  "export_tags",
];

const CATEGORY_FIELDS: Array<keyof ExportTableRow> = [
  "export_view_type",
  "export_scene_type",
  "export_case_type",
];

function groupLabel(groupName: string) {
  return groupName?.trim() || "未分组";
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

async function downloadZip(taskIds?: string[]) {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(taskIds ? { taskIds } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "导出失败");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kling_export_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportWorkbench({
  rows,
  onRowsChange,
  onBack,
  onRefresh,
}: {
  rows: ExportTableRow[];
  onRowsChange: (rows: ExportTableRow[]) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [bulkView, setBulkView] = useState("");
  const [bulkScene, setBulkScene] = useState("");
  const [bulkCase, setBulkCase] = useState("");
  const [extraViews, setExtraViews] = useState<string[]>([]);
  const [extraScenes, setExtraScenes] = useState<string[]>([]);
  const [extraCases, setExtraCases] = useState<string[]>([]);
  const rowsRef = useRef(rows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "exported") return !!row.exported_at;
      if (filter === "unexported") return !row.exported_at;
      return true;
    });
  }, [rows, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, ExportTableRow[]>();
    for (const row of visibleRows) {
      const label = groupLabel(row.group_name);
      map.set(label, [...(map.get(label) || []), row]);
    }
    return Array.from(map.entries());
  }, [visibleRows]);

  const selectedVisible = visibleRows.filter((row) => !!row.export_selected).length;
  const exportedVisible = visibleRows.filter((row) => !!row.exported_at).length;
  const optionSets = useMemo(() => ({
    views: uniq([...VIEW_OPTIONS, ...extraViews, ...rows.map((row) => row.export_view_type)]),
    scenes: uniq([...SCENE_OPTIONS, ...extraScenes, ...rows.map((row) => row.export_scene_type)]),
    cases: uniq([...CASE_OPTIONS, ...extraCases, ...rows.map((row) => row.export_case_type)]),
  }), [extraCases, extraScenes, extraViews, rows]);

  const normalizeCodes = (nextRows: ExportTableRow[]) => {
    return generateExportCodesForRows(nextRows, { overwriteExisting: true });
  };

  const commitRows = (nextRows: ExportTableRow[], dirtyIds: Set<string>) => {
    onRowsChange(nextRows);
    setDirty((prev) => {
      const next = new Set(prev);
      for (const id of dirtyIds) next.add(id);
      return next;
    });
  };

  const patchRow = (taskId: string, update: Partial<ExportTableRow>) => {
    const changesCodes = "export_view_type" in update || "export_scene_type" in update || "export_case_type" in update;
    const baseRows = rows.map((row) => row.task_id === taskId ? { ...row, ...update } : row);
    const nextRows = changesCodes ? normalizeCodes(baseRows) : baseRows;
    rememberOptions(update);
    const dirtyIds = new Set<string>([taskId]);
    if (changesCodes) {
      for (const row of rows) {
        const next = nextRows.find((item) => item.task_id === row.task_id);
        if (
          next &&
          (next.video_code !== row.video_code ||
            next.first_frame_code !== row.first_frame_code ||
            next.last_frame_code !== row.last_frame_code)
        ) {
          dirtyIds.add(row.task_id);
        }
      }
    }
    commitRows(nextRows, dirtyIds);
  };

  const rememberOptions = (update: Partial<ExportTableRow>) => {
    if (update.export_view_type) setExtraViews((prev) => uniq([...prev, String(update.export_view_type)]));
    if (update.export_scene_type) setExtraScenes((prev) => uniq([...prev, String(update.export_scene_type)]));
    if (update.export_case_type) setExtraCases((prev) => uniq([...prev, String(update.export_case_type)]));
  };

  const patchRows = (targetRows: ExportTableRow[], update: Partial<ExportTableRow>) => {
    const ids = new Set(targetRows.map((row) => row.task_id));
    const changesCodes = "export_view_type" in update || "export_scene_type" in update || "export_case_type" in update;
    const baseRows = rows.map((row) => ids.has(row.task_id) ? { ...row, ...update } : row);
    const nextRows = changesCodes ? normalizeCodes(baseRows) : baseRows;
    rememberOptions(update);
    const dirtyIds = new Set<string>(targetRows.map((row) => row.task_id));
    if (changesCodes) {
      for (const row of rows) {
        const next = nextRows.find((item) => item.task_id === row.task_id);
        if (
          next &&
          (next.video_code !== row.video_code ||
            next.first_frame_code !== row.first_frame_code ||
            next.last_frame_code !== row.last_frame_code)
        ) {
          dirtyIds.add(row.task_id);
        }
      }
    }
    commitRows(nextRows, dirtyIds);
  };

  const setVisibleSelected = (selected: boolean) => {
    patchRows(visibleRows, { export_selected: selected ? 1 : 0 });
  };

  const selectedRows = () => rows.filter((row) => !!row.export_selected);

  const applyBulkCategory = (targetRows: ExportTableRow[]) => {
    const update: Partial<ExportTableRow> = {};
    if (bulkView.trim()) update.export_view_type = bulkView.trim();
    if (bulkScene.trim()) update.export_scene_type = bulkScene.trim();
    if (bulkCase.trim()) update.export_case_type = bulkCase.trim();
    if (Object.keys(update).length === 0) {
      setMessage("请先填写要批量应用的视角、场景或类型");
      return;
    }
    patchRows(targetRows, update);
    setMessage(`已批量分类 ${targetRows.length} 行`);
  };

  const autoNumberRows = (targetRows: ExportTableRow[]) => {
    const targetIds = new Set(targetRows.map((row) => row.task_id));
    const normalized = normalizeCodes(rows);
    const dirtyIds = new Set<string>();
    for (const row of rows) {
      const next = normalized.find((item) => item.task_id === row.task_id);
      if (
        next &&
        targetIds.has(row.task_id) &&
        (next.video_code !== row.video_code ||
          next.first_frame_code !== row.first_frame_code ||
          next.last_frame_code !== row.last_frame_code)
      ) {
        dirtyIds.add(row.task_id);
      }
    }
    commitRows(normalized, dirtyIds);
    setMessage(`已刷新 ${targetRows.length} 行编号`);
  };

  const persistDirtyRows = useCallback(async (ids: Set<string>) => {
    const dirtyRows = rowsRef.current.filter((row) => ids.has(row.task_id));
    if (dirtyRows.length === 0) return 0;
    const res = await fetch("/api/export/rows", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: dirtyRows }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setDirty((prev) => {
      const next = new Set(prev);
      for (const row of dirtyRows) next.delete(row.task_id);
      return next;
    });
    return dirtyRows.length;
  }, []);

  useEffect(() => {
    if (dirty.size === 0) return;
    const ids = new Set(dirty);
    const timer = window.setTimeout(async () => {
      setSaving(true);
      setMessage("正在自动保存...");
      try {
        const count = await persistDirtyRows(ids);
        setMessage(`已自动保存 ${count} 行`);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "自动保存失败");
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dirty, persistDirtyRows]);

  const flushSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const count = await persistDirtyRows(new Set(dirty));
      setMessage(`已保存 ${count} 行`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const exportSelected = async () => {
    setExporting(true);
    setMessage("");
    try {
      if (dirty.size > 0) await flushSave();
      const taskIds = rows.filter((row) => !!row.export_selected).map((row) => row.task_id);
      if (taskIds.length === 0) throw new Error("请先勾选要导出的行");
      await downloadZip(taskIds);
      await onRefresh();
      setMessage(`已导出 ${taskIds.length} 条勾选记录`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-11 border-b flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />返回工作台
          </Button>
          <div>
            <h1 className="text-sm font-semibold">视频提示词导出表</h1>
            <p className="text-[10px] text-muted-foreground">
              {visibleRows.length} 行 · 已勾选 {selectedVisible} · 已导出 {exportedVisible}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilter("all")}>显示全部</Button>
          <Button variant={filter === "exported" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilter("exported")}>显示已导出</Button>
          <Button variant={filter === "unexported" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilter("unexported")}>显示未导出</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setVisibleSelected(true)}>勾选当前</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setVisibleSelected(false)}>取消当前</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => autoNumberRows(visibleRows)}>刷新当前编号</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />刷新
          </Button>
          <span className="text-[10px] text-muted-foreground">{saving ? "保存中" : dirty.size > 0 ? `${dirty.size} 行待保存` : "已保存"}</span>
          <Button size="sm" className="h-7 text-xs" onClick={exportSelected} disabled={exporting}>
            <Download className="h-3.5 w-3.5 mr-1" />导出选中
          </Button>
        </div>
      </header>

      {message && <div className="px-3 py-1 text-[11px] text-muted-foreground border-b">{message}</div>}
      <div className="border-b px-3 py-2 flex items-center gap-2 text-[11px] flex-shrink-0">
        <span className="text-muted-foreground">批量分类</span>
        <DatalistInput className="w-36" value={bulkView} onChange={setBulkView} options={optionSets.views} listId="bulk-view-options" placeholder="视角" />
        <DatalistInput className="w-36" value={bulkScene} onChange={setBulkScene} options={optionSets.scenes} listId="bulk-scene-options" placeholder="场景" />
        <DatalistInput className="w-44" value={bulkCase} onChange={setBulkCase} options={optionSets.cases} listId="bulk-case-options" placeholder="类型" />
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyBulkCategory(visibleRows)}>应用到当前筛选</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyBulkCategory(selectedRows())}>应用到已勾选</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => autoNumberRows(selectedRows())}>刷新已勾选编号</Button>
      </div>

      <main className="flex-1 overflow-auto">
        <div className="min-w-[2800px] p-3 space-y-3">
          {groups.map(([group, groupRows]) => {
            const isCollapsed = collapsed.has(group);
            const selectedCount = groupRows.filter((row) => !!row.export_selected).length;
            const exportedCount = groupRows.filter((row) => !!row.exported_at).length;
            return (
              <section key={group} className="border rounded-md overflow-hidden bg-card">
                <div className="w-full h-8 px-3 flex items-center gap-2 text-left border-b bg-muted/30">
                  <button
                    className="text-xs font-medium text-left truncate max-w-[360px]"
                    onClick={() => setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(group)) next.delete(group); else next.add(group);
                      return next;
                    })}
                  >
                    {group}
                  </button>
                  <Badge variant="outline" className="text-[10px]">{groupRows.length} 条</Badge>
                  <Badge variant="secondary" className="text-[10px]">勾选 {selectedCount}</Badge>
                  <Badge variant="secondary" className="text-[10px]">已导出 {exportedCount}</Badge>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => patchRows(groupRows, { export_selected: 1 })}>全选分组</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => patchRows(groupRows, { export_selected: 0 })}>取消分组</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => applyBulkCategory(groupRows)}>批量分类</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => autoNumberRows(groupRows)}>刷新分组编号</Button>
                  <div className="flex-1" />
                </div>
                {!isCollapsed && (
                  <ExportTable rows={groupRows} patchRow={patchRow} optionSets={optionSets} />
                )}
              </section>
            );
          })}
          {groups.length === 0 && (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground border rounded-md">
              当前筛选没有记录
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ExportTable({
  rows,
  patchRow,
  optionSets,
}: {
  rows: ExportTableRow[];
  patchRow: (taskId: string, update: Partial<ExportTableRow>) => void;
  optionSets: { views: string[]; scenes: string[]; cases: string[] };
}) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead className="bg-background sticky top-0 z-10">
        <tr className="[&>th]:border-b [&>th]:border-r [&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium">
          <th className="w-16">导出</th>
          <th className="w-20">状态</th>
          <th className="w-28">分组</th>
          <th className="w-44">视频/任务</th>
          <th className="w-80">视频提示词</th>
          <th className="w-44">视角</th>
          <th className="w-44">场景</th>
          <th className="w-52">案例类型</th>
          <th className="w-44">视频编号</th>
          <th className="w-44">首帧编号</th>
          <th className="w-44">尾帧编号</th>
          <th className="w-36">输入图片来源</th>
          <th className="w-32">图片工具</th>
          <th className="w-32">视频工具</th>
          <th className="w-24">是否可用</th>
          <th className="w-32">问题类型</th>
          <th className="w-56">问题描述</th>
          <th className="w-40">标签</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.task_id} className="[&>td]:border-b [&>td]:border-r [&>td]:p-1 align-top">
            <td className="text-center">
              <input
                type="checkbox"
                checked={!!row.export_selected}
                onChange={(e) => patchRow(row.task_id, { export_selected: e.target.checked ? 1 : 0 })}
              />
            </td>
            <td>
              {row.exported_at ? (
                <span className="text-green-600">已导出</span>
              ) : (
                <span className="text-muted-foreground">未导出</span>
              )}
            </td>
            <td>{groupLabel(row.group_name)}</td>
            <td>
              <div className="space-y-1">
                {row.video_url && (
                  <a href={row.video_url} target="_blank" className="text-blue-600 hover:underline">打开视频</a>
                )}
                <p className="break-all text-[10px] text-muted-foreground">{row.task_id}</p>
              </div>
            </td>
            <td>
              <Textarea className="min-h-20 text-[11px]" value={row.prompt} readOnly />
            </td>
            {CATEGORY_FIELDS.map((field) => (
              <EditableCell key={field} field={field} row={row} patchRow={patchRow} optionSets={optionSets} />
            ))}
            <ReadonlyCode value={row.video_code} />
            <ReadonlyCode value={row.first_frame_code} />
            <ReadonlyCode value={row.last_frame_code} />
            {EDITABLE_FIELDS.map((field) => (
              <EditableCell key={field} field={field} row={row} patchRow={patchRow} optionSets={optionSets} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EditableCell({
  field,
  row,
  patchRow,
  optionSets,
}: {
  field: keyof ExportTableRow;
  row: ExportTableRow;
  patchRow: (taskId: string, update: Partial<ExportTableRow>) => void;
  optionSets: { views: string[]; scenes: string[]; cases: string[] };
}) {
  return (
    <td>
      {field === "issue_description" ? (
        <Textarea
          className="min-h-16 text-[11px]"
          value={String(row[field] || "")}
          onChange={(e) => patchRow(row.task_id, { [field]: e.target.value } as Partial<ExportTableRow>)}
        />
      ) : field === "export_view_type" || field === "export_scene_type" || field === "export_case_type" ? (
        <DatalistInput
          className="h-7 text-[11px]"
          value={String(row[field] || "")}
          onChange={(value) => patchRow(row.task_id, { [field]: value } as Partial<ExportTableRow>)}
          options={
            field === "export_view_type"
              ? optionSets.views
              : field === "export_scene_type"
                ? optionSets.scenes
                : optionSets.cases
          }
          listId={`${field}-${row.task_id}-options`}
        />
      ) : (
        <Input
          className="h-7 text-[11px]"
          value={String(row[field] || "")}
          onChange={(e) => patchRow(row.task_id, { [field]: e.target.value } as Partial<ExportTableRow>)}
        />
      )}
    </td>
  );
}

function ReadonlyCode({ value }: { value: string }) {
  return (
    <td>
      <div className="min-h-7 rounded border bg-muted/30 px-2 py-1 text-[11px] break-all text-muted-foreground">
        {value || "分类完整后自动生成"}
      </div>
    </td>
  );
}

function DatalistInput({
  value,
  onChange,
  options,
  listId,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  listId: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <>
      <Input
        className={className}
        value={value}
        list={listId}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </>
  );
}
