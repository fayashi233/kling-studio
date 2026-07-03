"use client";

import { useMemo, useState } from "react";
import { Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_EXPORT_METADATA, type ExportMetadata } from "@/types";
import { useAppStore } from "@/stores/useAppStore";

const VIEW_OPTIONS = ["vehicle view", "wayside view"];
const SCENE_OPTIONS = ["Bridges", "Section-区间", "station", "terminal", "Tunnel"];
const CASE_OPTIONS = [
  "people_intrusion_case",
  "cow_intrusion_case",
  "tree_intrusion_case",
  "rock_intrusion_case",
  "fire_intrusion_case",
  "box_intrusion_case",
  "car_intrusion_case",
];
const USABLE_OPTIONS = ["", "是", "否"];

type Task = ReturnType<typeof useAppStore.getState>["currentTask"];

function pickMetadata(task: Task): ExportMetadata {
  return {
    ...DEFAULT_EXPORT_METADATA,
    ...(task?.exportMetadata || {}),
  };
}

export function ExportMetadataPanel() {
  const { currentTask } = useAppStore();

  if (!currentTask?.taskId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-muted-foreground">
        <Download className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-xs">请选择一个已生成视频</p>
        <p className="text-[10px] mt-1">生成或从历史中选择视频后可编辑导出标注</p>
      </div>
    );
  }

  return <ExportMetadataForm key={currentTask.taskId} task={currentTask} />;
}

function ExportMetadataForm({ task }: { task: NonNullable<Task> }) {
  const { updateHistoryTask } = useAppStore();
  const [metadata, setMetadata] = useState<ExportMetadata>(pickMetadata(task));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const completeness = useMemo(() => {
    const required = [
      metadata.export_view_type,
      metadata.export_scene_type,
      metadata.export_case_type,
      metadata.video_code,
    ];
    return required.filter((v) => v.trim()).length;
  }, [metadata]);

  const setField = (key: keyof ExportMetadata, value: string) => {
    setMetadata((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!task.taskId) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/generations/export-metadata", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.taskId, ...metadata }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const nextMetadata = { ...metadata, ...(data.generation || {}) };
      setMetadata(nextMetadata);
      updateHistoryTask(task.taskId, {
        exportMetadata: nextMetadata,
        quality: nextMetadata.usable === "否" ? "bad" : task.quality,
        rejectReason: nextMetadata.issue_type || task.rejectReason,
      });
      setMessage("标注已保存");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">导出标注</p>
          <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">
            {task.taskId}
          </p>
        </div>
        <Badge variant={completeness === 4 ? "secondary" : "outline"} className="text-[10px]">
          {completeness}/4
        </Badge>
      </div>

      <section className="space-y-2">
        <p className="text-[11px] font-medium">目录分类</p>
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            checked={!!metadata.export_selected}
            onChange={(e) => setMetadata((prev) => ({ ...prev, export_selected: e.target.checked ? 1 : 0 }))}
          />
          是否导出
        </label>
        <SelectLike label="视角" value={metadata.export_view_type}
          options={VIEW_OPTIONS} onChange={(v) => setField("export_view_type", v)} />
        <SelectLike label="场景" value={metadata.export_scene_type}
          options={SCENE_OPTIONS} onChange={(v) => setField("export_scene_type", v)} />
        <SelectLike label="案例类型" value={metadata.export_case_type}
          options={CASE_OPTIONS} onChange={(v) => setField("export_case_type", v)} />
      </section>

      <section className="grid grid-cols-2 gap-2">
        <ReadonlyField label="视频编号" value={metadata.video_code} />
        <ReadonlyField label="首帧编号" value={metadata.first_frame_code} />
        <ReadonlyField label="尾帧编号" value={metadata.last_frame_code} />
        <Field label="原图编号" value={metadata.original_image_code} onChange={(v) => setField("original_image_code", v)} />
        <Field label="图片来源" value={metadata.image_source} onChange={(v) => setField("image_source", v)} />
        <Field label="图片工具" value={metadata.image_tool} onChange={(v) => setField("image_tool", v)} />
        <Field label="视频工具" value={metadata.video_tool} onChange={(v) => setField("video_tool", v)} />
        <SelectLike label="是否可用" value={metadata.usable}
          options={USABLE_OPTIONS} onChange={(v) => setField("usable", v)} />
      </section>

      <section className="space-y-2">
        <Field label="主要问题类型" value={metadata.issue_type} onChange={(v) => setField("issue_type", v)} />
        <div className="space-y-1">
          <Label className="text-[10px]">主要问题描述</Label>
          <Textarea
            className="min-h-16 text-xs"
            value={metadata.issue_description}
            onChange={(e) => setField("issue_description", e.target.value)}
          />
        </div>
        <Field label="标签（逗号分隔）" value={metadata.export_tags} onChange={(v) => setField("export_tags", v)} />
      </section>

      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-[11px]" onClick={save} disabled={saving}>
          <Save className="h-3 w-3 mr-1" />保存标注
        </Button>
      </div>

      {message && <p className="text-[10px] text-muted-foreground">{message}</p>}
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      <div className="min-h-7 rounded border bg-muted/30 px-2 py-1 text-xs break-all text-muted-foreground">
        {value || "分类保存后自动生成"}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      <Input className="h-7 text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SelectLike({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      <Input
        className="h-7 text-xs"
        value={value}
        list={`${label}-options`}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={`${label}-options`}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </div>
  );
}
