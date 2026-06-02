"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { getModelConfig, getModelsForProvider } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserPlus, X, Upload, Link, Hash } from "lucide-react";
import type { ElementRecord } from "@/types";

export function SubjectManager() {
  const {
    elements, setElements,
    selectedElementIds, toggleElementId,
    params, settings,
  } = useAppStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showManualId, setShowManualId] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [manualIdInput, setManualIdInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const models = getModelsForProvider(settings.provider || "kling-official");
  const modelConfig = getModelConfig(settings.provider || "kling-official", params.model_name);
  if (!modelConfig?.supportsElement) return null;

  const refreshElements = async () => {
    const res = await fetch("/api/elements");
    setElements(await res.json());
  };

  // Load on mount
  useEffect(() => {
    if (elements.length === 0) refreshElements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (file: File) => {
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleCreate = useCallback(async () => {
    if (!pendingFile && !previewUrl?.startsWith("http")) return;
    setUploading(true);
    try {
      const formData = new FormData();
      if (pendingFile) {
        formData.append("file", pendingFile);
      } else if (previewUrl) {
        formData.append("url", previewUrl);
      }
      formData.append("name", nameInput || "未命名主体");
      if (tagInput) formData.append("tag", tagInput);

      const res = await fetch("/api/elements", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setShowCreate(false);
      setNameInput("");
      setTagInput("");
      setPendingFile(null);
      setPreviewUrl(null);
      refreshElements();
    } catch (err) {
      alert("创建失败: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [pendingFile, previewUrl, nameInput, tagInput]);

  const handleManualAdd = async () => {
    if (!manualIdInput.trim()) return;
    const formData = new FormData();
    formData.append("manual_id", manualIdInput.trim());
    formData.append("name", "手动主体 " + manualIdInput.trim().substring(0, 6));
    const res = await fetch("/api/elements", { method: "POST", body: formData });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    setManualIdInput("");
    setShowManualId(false);
    refreshElements();
  };

  const handleDelete = useCallback(async (id: string, apiElementId: string) => {
    if (!confirm("确定删除此主体？")) return;
    await fetch("/api/elements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    // Unbind if selected
    if (selectedElementIds.includes(apiElementId)) {
      toggleElementId(apiElementId);
    }
    refreshElements();
  }, [selectedElementIds, toggleElementId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFileSelect(file);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">主体绑定</Label>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => setShowManualId(!showManualId)}>
            <Hash className="h-3 w-3 mr-1" />手动ID
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => { setShowCreate(!showCreate); setShowManualId(false); }}>
            <UserPlus className="h-3 w-3 mr-1" />创建主体
          </Button>
        </div>
      </div>

      {/* Manual ID Input */}
      {showManualId && (
        <div className="flex gap-1">
          <Input placeholder="输入主体 ID（逗号分隔多个）..." value={manualIdInput}
            onChange={(e) => setManualIdInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualAdd()}
            className="h-7 text-xs" />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleManualAdd}>添加</Button>
        </div>
      )}

      {/* Create Element Panel */}
      {showCreate && (
        <div className="border rounded-md p-3 space-y-2 bg-accent/20">
          <Input placeholder="主体名称（最多15字符）" value={nameInput}
            onChange={(e) => setNameInput(e.target.value)} maxLength={15}
            className="h-7 text-xs" />
          <Input placeholder="标签（可选，如 character）" value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            className="h-7 text-xs" />

          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />

          {previewUrl ? (
            <div className="relative rounded-md overflow-hidden border h-24">
              <img src={previewUrl} alt="预览" className="w-full h-full object-cover" />
              <Button variant="destructive" size="sm"
                className="absolute top-1 right-1 h-5 w-5 p-0"
                onClick={() => { setPreviewUrl(null); setPendingFile(null); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-accent/50 transition-colors h-24 flex flex-col items-center justify-center"
              onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}>
              <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground">拖拽或点击上传主体图片</p>
            </div>
          )}

          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => { setShowCreate(false); setPreviewUrl(null); setPendingFile(null); }}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate}
              disabled={!previewUrl || uploading}>
              {uploading ? "创建中..." : "确认创建"}
            </Button>
          </div>
        </div>
      )}

      {/* Element Grid */}
      {elements.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {elements.map((el: ElementRecord) => {
            const isBound = selectedElementIds.includes(el.api_element_id);
            return (
              <div key={el.id}
                className={`relative rounded-md overflow-hidden border-2 transition-colors group ${
                  isBound ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                }`}>
                <div className="aspect-video bg-muted">
                  {el.cover_url ? (
                    <img src={el.cover_url} alt={el.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <UserPlus className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="p-1.5 space-y-1">
                  <p className="text-[10px] font-medium truncate" title={el.name}>{el.name}</p>
                  <p className="text-[9px] text-muted-foreground truncate" title={el.api_element_id}>
                    {el.api_element_id.length > 16 ? el.api_element_id.substring(0, 14) + "..." : el.api_element_id}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant={isBound ? "default" : "outline"}
                      size="sm"
                      className="h-5 px-2 text-[9px] flex-1"
                      onClick={() => toggleElementId(el.api_element_id)}>
                      {isBound ? "已绑定" : "绑定"}
                    </Button>
                    <Button variant="ghost" size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(el.id, el.api_element_id)}>
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected badges */}
      {selectedElementIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">已绑定:</span>
          {selectedElementIds.map((eid) => {
            const el = elements.find((e) => e.api_element_id === eid);
            return (
              <Badge key={eid} variant="secondary" className="text-[9px] h-4 gap-1">
                {el?.name || eid.substring(0, 8)}
                <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => toggleElementId(eid)} />
              </Badge>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {elements.length === 0 && !showCreate && (
        <p className="text-[10px] text-muted-foreground text-center py-3">
          暂无主体。点击"创建主体"上传图片创建，或点击"手动ID"输入已有主体 ID
        </p>
      )}
    </div>
  );
}
