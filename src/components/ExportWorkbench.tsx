"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Download, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface ExportTableRow {
  id: string;
  prompt_id: string;
  task_id: string;
  task_status: string;
  video_url: string | null;
  prompt: string;
  group_name: string;
  export_selected: number;
  exported_at: string;
  export_batch_id: string;
  export_view_type: string;
  export_scene_type: string;
  export_case_type: string;
  video_code: string;
  first_frame_code: string;
  last_frame_code: string;
  original_image_code: string;
  image_source: string;
  image_tool: string;
  video_tool: string;
  usable: string;
  issue_type: string;
  issue_description: string;
  export_tags: string;
}

type FilterMode = "all" | "exported" | "unexported";

const EDITABLE_FIELDS: Array<keyof ExportTableRow> = [
  "video_code",
  "first_frame_code",
  "last_frame_code",
  "original_image_code",
  "image_source",
  "image_tool",
  "video_tool",
  "export_view_type",
  "export_scene_type",
  "export_case_type",
  "usable",
  "issue_type",
  "issue_description",
  "export_tags",
];

function groupLabel(groupName: string) {
  return groupName?.trim() || "未分组";
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

  const patchRow = (taskId: string, update: Partial<ExportTableRow>) => {
    onRowsChange(rows.map((row) => row.task_id === taskId ? { ...row, ...update } : row));
    setDirty((prev) => new Set(prev).add(taskId));
  };

  const setVisibleSelected = (selected: boolean) => {
    const visibleIds = new Set(visibleRows.map((row) => row.task_id));
    onRowsChange(rows.map((row) => visibleIds.has(row.task_id)
      ? { ...row, export_selected: selected ? 1 : 0 }
      : row
    ));
    setDirty((prev) => {
      const next = new Set(prev);
      for (const row of visibleRows) next.add(row.task_id);
      return next;
    });
  };

  const persistDirtyRows = async () => {
    const dirtyRows = rows.filter((row) => dirty.has(row.task_id));
    if (dirtyRows.length === 0) return 0;
    const res = await fetch("/api/export/rows", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: dirtyRows }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setDirty(new Set());
    return dirtyRows.length;
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const count = await persistDirtyRows();
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
      if (dirty.size > 0) await persistDirtyRows();
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
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />刷新
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving || dirty.size === 0}>
            <Save className="h-3.5 w-3.5 mr-1" />保存
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={exportSelected} disabled={exporting}>
            <Download className="h-3.5 w-3.5 mr-1" />导出选中
          </Button>
        </div>
      </header>

      {message && <div className="px-3 py-1 text-[11px] text-muted-foreground border-b">{message}</div>}

      <main className="flex-1 overflow-auto">
        <div className="min-w-[2200px] p-3 space-y-3">
          {groups.map(([group, groupRows]) => {
            const isCollapsed = collapsed.has(group);
            const selectedCount = groupRows.filter((row) => !!row.export_selected).length;
            const exportedCount = groupRows.filter((row) => !!row.exported_at).length;
            return (
              <section key={group} className="border rounded-md overflow-hidden bg-card">
                <button
                  className="w-full h-8 px-3 flex items-center gap-2 text-left border-b bg-muted/30"
                  onClick={() => setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(group)) next.delete(group); else next.add(group);
                    return next;
                  })}
                >
                  <span className="text-xs font-medium flex-1">{group}</span>
                  <Badge variant="outline" className="text-[10px]">{groupRows.length} 条</Badge>
                  <Badge variant="secondary" className="text-[10px]">勾选 {selectedCount}</Badge>
                  <Badge variant="secondary" className="text-[10px]">已导出 {exportedCount}</Badge>
                </button>
                {!isCollapsed && (
                  <ExportTable rows={groupRows} patchRow={patchRow} />
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
}: {
  rows: ExportTableRow[];
  patchRow: (taskId: string, update: Partial<ExportTableRow>) => void;
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
          <th className="w-28">视频编号</th>
          <th className="w-28">首帧编号</th>
          <th className="w-28">尾帧编号</th>
          <th className="w-32">原图编号</th>
          <th className="w-32">输入图片来源</th>
          <th className="w-28">图片工具</th>
          <th className="w-28">视频工具</th>
          <th className="w-32">视角</th>
          <th className="w-32">场景</th>
          <th className="w-40">案例类型</th>
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
            {EDITABLE_FIELDS.map((field) => (
              <td key={field}>
                {field === "issue_description" ? (
                  <Textarea
                    className="min-h-16 text-[11px]"
                    value={String(row[field] || "")}
                    onChange={(e) => patchRow(row.task_id, { [field]: e.target.value } as Partial<ExportTableRow>)}
                  />
                ) : (
                  <Input
                    className="h-7 text-[11px]"
                    value={String(row[field] || "")}
                    onChange={(e) => patchRow(row.task_id, { [field]: e.target.value } as Partial<ExportTableRow>)}
                  />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
