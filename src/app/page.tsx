"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { Sidebar } from "@/components/Sidebar";
import { PromptEditor } from "@/components/PromptEditor";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ImageManager } from "@/components/ImageManager";
import { SubjectManager } from "@/components/SubjectManager";
import { LLMPanel } from "@/components/LLMPanel";
import { TaskHistory } from "@/components/TaskHistory";
import { VersionTimeline } from "@/components/VersionTimeline";
import { SettingsDialog } from "@/components/SettingsDialog";
import { BatchImport } from "@/components/BatchImport";
import { ExportMetadataPanel } from "@/components/ExportMetadataPanel";
import { ExportWorkbench, type ExportTableRow } from "@/components/ExportWorkbench";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Film, History, Sparkles, ImageIcon, FolderOpen, GitBranch } from "lucide-react";
import type { ModelName, Mode, Duration, AspectRatio } from "@/types";

function useResizable(init: number, min: number, max: number, invert = false) {
  const [size, setSize] = useState(init);
  const dragging = useRef(false);
  const startRef = useRef({ x: 0, size: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startRef.current = { x: e.clientX, size };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [size]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startRef.current.x;
      const adjusted = invert ? -delta : delta;
      const newSize = Math.min(max, Math.max(min, startRef.current.size + adjusted));
      setSize(newSize);
    };
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [min, max]);

  return { size, onMouseDown };
}

export default function HomePage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [rightTab, setRightTab] = useState("video");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRows, setExportRows] = useState<ExportTableRow[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const {
    params, currentImage, currentLastFrame, isGenerating, setIsGenerating,
    setCurrentTask, addToHistory, updateHistoryTask,
    setSavedPrompts, setImages, setSettings, setSettingsLoaded,
    llmLoading, setLlmLoading, setHistory, history,
    currentPromptId, setCurrentPromptId,
    selectedElementIds,
  } = useAppStore();

  const pollingTasksRef = useRef<Set<string>>(new Set());

  // Resizable panels
  const sidebar = useResizable(260, 180, 400);
  const rightPanel = useResizable(360, 240, 600, true);

  // Load prompt and find associated video
  const handleLoadPrompt = useCallback((p: { id: string; prompt: string; negative_prompt: string; model_name: string; mode: string; duration: string; aspect_ratio: string; cfg_scale: number; reference_image: string | null; last_frame_image?: string | null }) => {
    // Track which prompt we're editing
    useAppStore.getState().setCurrentPromptId(p.id);
    // Load prompt params
    useAppStore.getState().setParams({
      prompt: p.prompt,
      negative_prompt: p.negative_prompt,
      model_name: p.model_name as ModelName,
      mode: p.mode as Mode,
      duration: p.duration as Duration,
      aspect_ratio: p.aspect_ratio as AspectRatio,
      cfg_scale: p.cfg_scale,
    });
    if (p.reference_image) {
      useAppStore.getState().setCurrentImage(p.reference_image);
    } else {
      useAppStore.getState().setCurrentImage(null);
    }
    useAppStore.getState().setCurrentLastFrame(p.last_frame_image || null);

    // Find latest generation for this prompt
    const matchingTask = history.find((t) => t.promptId === p.id);
    if (matchingTask) {
      setCurrentTask(matchingTask);
      setRightTab("video");
    }
  }, [history, setCurrentTask]);

  // ── Load initial data ──
  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, promptsRes, imagesRes, historyRes] = await Promise.all([
          fetch("/api/settings"), fetch("/api/prompts"),
          fetch("/api/images"), fetch("/api/generations"),
        ]);
        const [settingsData, promptsData, imagesData, historyData] = await Promise.all([
          settingsRes.json(), promptsRes.json(), imagesRes.json(), historyRes.json(),
        ]);
        setSettings(settingsData);
        setSettingsLoaded(true);
        setSavedPrompts(promptsData);
        setImages(imagesData);

        if (Array.isArray(historyData)) {
          const restored = historyData.map((g: Record<string, unknown>) => ({
            id: g.id as string,
            promptId: g.prompt_id as string,
            taskId: g.task_id as string,
            status: g.task_status as "submitted" | "processing" | "succeed" | "failed",
            videoUrl: g.video_url as string | undefined,
            errorMsg: g.error_msg as string | undefined,
            startedAt: new Date(g.created_at as string).getTime(),
            quality: (g.quality as string) || undefined,
            rejectReason: (g.reject_reason as string) || undefined,
            exportMetadata: {
              export_view_type: (g.export_view_type as string) || "",
              export_scene_type: (g.export_scene_type as string) || "",
              export_case_type: (g.export_case_type as string) || "",
              video_code: (g.video_code as string) || "",
              first_frame_code: (g.first_frame_code as string) || "",
              last_frame_code: (g.last_frame_code as string) || "",
              original_image_code: (g.original_image_code as string) || "",
              image_source: (g.image_source as string) || "",
              image_tool: (g.image_tool as string) || "",
              video_tool: (g.video_tool as string) || "可灵-api",
              usable: (g.usable as string) || "",
              issue_type: (g.issue_type as string) || "",
              issue_description: (g.issue_description as string) || "",
              export_tags: (g.export_tags as string) || "",
              export_selected: Number(g.export_selected || 0),
              exported_at: (g.exported_at as string) || "",
              export_batch_id: (g.export_batch_id as string) || "",
            },
          }));
          setHistory(restored);
          for (const g of restored) {
            if (g.status === "submitted" || g.status === "processing") startPolling(g.taskId);
          }
        }
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Poll ──
  const startPolling = useCallback((taskId: string) => {
    if (pollingTasksRef.current.has(taskId)) return;
    pollingTasksRef.current.add(taskId);
    const poll = async () => {
      try {
        const res = await fetch(`/api/kling/status/${taskId}`);
        const data = await res.json();
        if (data.task_status === "succeed" || data.task_status === "failed") {
          pollingTasksRef.current.delete(taskId);
          setIsGenerating(false);
          updateHistoryTask(taskId, {
            status: data.task_status,
            videoUrl: data.task_result?.videos?.[0]?.url,
            errorMsg: data.task_status_msg,
          });
          if (data.task_status === "succeed" && data.task_result?.videos?.[0]?.url) {
            fetch("/api/videos/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: data.task_result.videos[0].url, taskId }),
            }).catch(() => {});
          }
        } else {
          updateHistoryTask(taskId, { status: data.task_status });
          setTimeout(poll, 5000);
        }
      } catch { setTimeout(poll, 8000); }
    };
    setTimeout(poll, 3000);
  }, [setIsGenerating, updateHistoryTask]);

  useEffect(() => () => { pollingTasksRef.current.clear(); }, []);

  // ── Generate ──
  const handleGenerate = useCallback(async () => {
    if (!params.prompt.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params, image: currentImage || undefined, lastFrame: currentLastFrame || undefined, parentId: currentVersionId, promptId: currentPromptId, elementIds: selectedElementIds.length > 0 ? selectedElementIds : undefined }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); setIsGenerating(false); return; }
      // If this is the first generation (no currentPromptId), bind to the newly created prompt
      if (!currentPromptId && data.promptId) {
        useAppStore.getState().setCurrentPromptId(data.promptId);
      }
      const task = { id: data.generationId, promptId: data.promptId, taskId: data.taskId, status: "submitted" as const, startedAt: Date.now() };
      addToHistory(task);
      setCurrentTask(task);
      startPolling(data.taskId);
      // 刷新侧边栏提示词列表（生成 API 已保存 prompt 到 DB）
      fetch("/api/prompts").then(r => r.json()).then(setSavedPrompts).catch(() => {});
    } catch (err) { alert("提交失败: " + (err as Error).message); setIsGenerating(false); }
  }, [params, currentImage, currentLastFrame, currentVersionId, currentPromptId, selectedElementIds, setIsGenerating, addToHistory, setCurrentTask, startPolling, setSavedPrompts]);

  // ── Batch ──
  const handleBatchGenerate = useCallback(
    async (prompts: Array<{ prompt: string; negative_prompt: string; model_name: string; mode: string; duration: string; aspect_ratio: string; cfg_scale: number; reference_image: string | null; last_frame_image?: string | null }>) => {
      setBatchProgress({ current: 0, total: prompts.length });
      for (let i = 0; i < prompts.length; i++) {
        const p = prompts[i];
        setBatchProgress({ current: i + 1, total: prompts.length });
        try {
          const res = await fetch("/api/kling/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ params: { model_name: p.model_name, prompt: p.prompt, negative_prompt: p.negative_prompt, mode: p.mode, duration: p.duration, aspect_ratio: p.aspect_ratio, cfg_scale: p.cfg_scale }, image: p.reference_image || undefined, lastFrame: p.last_frame_image || undefined }),
          });
          const data = await res.json();
          if (data.taskId) {
            addToHistory({ id: data.generationId, promptId: data.promptId, taskId: data.taskId, status: "submitted" as const, startedAt: Date.now() });
            startPolling(data.taskId);
          }
          await new Promise((r) => setTimeout(r, 500));
        } catch (err) { console.error("Batch error:", err); }
      }
      setTimeout(() => setBatchProgress(null), 3000);
    }, [addToHistory, startPolling]);

  // ── LLM ──
  const handleLLMAction = useCallback(
    async (action: "expand" | "optimize" | "variants", lang: string = "en") => {
      if (!params.prompt.trim()) return;
      setLlmLoading(true);
      try {
        const res = await fetch("/api/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, prompt: params.prompt, count: 3, lang }),
        });
        const data = await res.json();
        if (data.error) { alert(data.error); return; }
        if (action === "expand" || action === "optimize") {
          useAppStore.getState().setParams({ prompt: Array.isArray(data.result) ? data.result[0] : data.result });
        }
      } catch (err) { alert("LLM 调用失败: " + (err as Error).message); }
      finally { setLlmLoading(false); }
    }, [params.prompt, setLlmLoading]);

  // ── Save prompt to library ──
  const handleSavePrompt = useCallback(async () => {
    if (!params.prompt.trim()) return;
    await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: params.prompt,
        negative_prompt: params.negative_prompt,
        model_name: params.model_name,
        mode: params.mode,
        duration: params.duration,
        aspect_ratio: params.aspect_ratio,
        cfg_scale: params.cfg_scale,
        reference_image: currentImage || null,
        last_frame_image: currentLastFrame || "",
        group_name: activeGroup || "",
      }),
    });
    // Refresh prompts
    const res = await fetch("/api/prompts");
    setSavedPrompts(await res.json());
  }, [params, currentImage, currentLastFrame, activeGroup, setSavedPrompts]);

  // ── Generate and switch to video tab ──
  const handleGenerateAndSwitch = useCallback(async () => {
    await handleGenerate();
    setRightTab("video");
  }, [handleGenerate]);

  const refreshExportRows = useCallback(async () => {
    const res = await fetch("/api/export/rows");
    const data = await res.json();
    if (Array.isArray(data)) setExportRows(data);
  }, []);

  const openExportWorkbench = useCallback(async () => {
    setExportLoading(true);
    try {
      await refreshExportRows();
      setExportOpen(true);
    } catch (err) {
      alert("加载导出表失败: " + (err as Error).message);
    } finally {
      setExportLoading(false);
    }
  }, [refreshExportRows]);

  const handleExportRowsChange = useCallback((rows: ExportTableRow[]) => {
    setExportRows(rows);
    const current = useAppStore.getState().currentTask;
    if (!current) return;
    const row = rows.find((item) => item.task_id === current.taskId);
    if (!row) return;
    updateHistoryTask(current.taskId, {
      exportMetadata: {
        export_view_type: row.export_view_type,
        export_scene_type: row.export_scene_type,
        export_case_type: row.export_case_type,
        video_code: row.video_code,
        first_frame_code: row.first_frame_code,
        last_frame_code: row.last_frame_code,
        original_image_code: row.original_image_code,
        image_source: row.image_source,
        image_tool: row.image_tool,
        video_tool: row.video_tool,
        usable: row.usable,
        issue_type: row.issue_type,
        issue_description: row.issue_description,
        export_tags: row.export_tags,
        export_selected: row.export_selected,
        exported_at: row.exported_at,
        export_batch_id: row.export_batch_id,
      },
    });
  }, [updateHistoryTask]);

  if (exportOpen) {
    return (
      <ExportWorkbench
        rows={exportRows}
        onRowsChange={handleExportRowsChange}
        onBack={() => setExportOpen(false)}
        onRefresh={refreshExportRows}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <header className="h-10 border-b flex items-center px-3 justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <h1 className="text-xs font-bold">可灵 AI 视频工作台</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Batch progress */}
          {batchProgress && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {batchProgress.current}/{batchProgress.total}
              </span>
            </div>
          )}
<Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
            onClick={() => fetch("/api/videos/open", { method: "POST" }).catch(() => {})}>
            <FolderOpen className="h-3 w-3 mr-1" />视频文件夹
          </Button>
          <Button variant="default" size="sm" className="h-6 px-2 text-[10px]"
            onClick={openExportWorkbench} disabled={exportLoading}>
            <Download className="h-3 w-3 mr-1" />导出
          </Button>
          {isGenerating && <Badge variant="secondary" className="text-[10px] animate-pulse bg-yellow-500/20 text-yellow-700">生成中...</Badge>}
          {llmLoading && <Badge variant="secondary" className="text-[10px] animate-pulse bg-blue-500/20 text-blue-700">AI 处理中...</Badge>}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar */}
        <div style={{ width: sidebar.size }} className="flex-shrink-0 overflow-hidden">
          <Sidebar
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenImport={() => setImportOpen(true)}
            onBatchGenerate={handleBatchGenerate}
            onGroupChange={setActiveGroup}
            onLoadPrompt={handleLoadPrompt}
          />
        </div>

        {/* Resize Handle */}
        <div
          className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-col-resize flex-shrink-0"
          onMouseDown={sidebar.onMouseDown}
        />

        {/* Center */}
        <div className="flex-1 min-w-0 flex flex-col p-3 gap-3 overflow-y-auto">
          <div className="border rounded-lg p-3 bg-card">
            <PromptEditor
              onGenerate={handleGenerate}
              onGenerateAndSwitch={handleGenerateAndSwitch}
              onSave={handleSavePrompt}
              onLLMAction={handleLLMAction}
              onNewPrompt={async () => {
                // 如果当前提示词不为空，先保存到提示词库
                if (params.prompt.trim()) {
                  await fetch("/api/prompts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      prompt: params.prompt,
                      negative_prompt: params.negative_prompt,
                      model_name: params.model_name,
                      mode: params.mode,
                      duration: params.duration,
                      aspect_ratio: params.aspect_ratio,
                      cfg_scale: params.cfg_scale,
                      reference_image: currentImage || null,
                      last_frame_image: currentLastFrame || "",
                      group_name: activeGroup || "",
                    }),
                  });
                  // 刷新侧边栏提示词列表
                  const promptsRes = await fetch("/api/prompts");
                  setSavedPrompts(await promptsRes.json());
                }
                // 清空表单（保留模型设置）
                useAppStore.getState().setCurrentPromptId(null);
                useAppStore.getState().setParams({
                  prompt: "", negative_prompt: "",
                  model_name: params.model_name, mode: params.mode,
                  duration: params.duration, aspect_ratio: params.aspect_ratio,
                  cfg_scale: params.cfg_scale,
                });
                useAppStore.getState().setCurrentImage(null);
                useAppStore.getState().setCurrentLastFrame(null);
                useAppStore.getState().setSelectedElementIds([]);
                useAppStore.getState().setCurrentTask(null);
                setCurrentVersionId(null);
              }}
            />
          </div>
          <div className="flex-1 min-h-0">
            <Tabs defaultValue="image" className="h-full flex flex-col">
              <TabsList className="w-fit h-7">
                <TabsTrigger value="image" className="text-[11px] h-5 px-2"><ImageIcon className="h-3 w-3 mr-1" />参考图</TabsTrigger>
                <TabsTrigger value="llm" className="text-[11px] h-5 px-2"><Sparkles className="h-3 w-3 mr-1" />LLM 辅助</TabsTrigger>
              </TabsList>
              <TabsContent value="image" className="flex-1 mt-2">
                <div className="border rounded-lg p-3 bg-card h-full overflow-y-auto">
                  <ImageManager />
                  <hr className="my-3" />
                  <SubjectManager />
                </div>
              </TabsContent>
              <TabsContent value="llm" className="flex-1 mt-2">
                <div className="border rounded-lg p-3 bg-card h-full overflow-y-auto"><LLMPanel /></div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-col-resize flex-shrink-0"
          onMouseDown={rightPanel.onMouseDown}
        />

        {/* Right Panel */}
        <div style={{ width: rightPanel.size }} className="flex-shrink-0 overflow-hidden">
          <Tabs value={rightTab} onValueChange={setRightTab} className="h-full flex flex-col">
            <TabsList className="w-full rounded-none border-b flex-shrink-0 h-8">
              <TabsTrigger value="video" className="flex-1 text-[11px] rounded-none"><Film className="h-3 w-3 mr-1" />视频预览</TabsTrigger>
              <TabsTrigger value="export" className="flex-1 text-[11px] rounded-none"><Download className="h-3 w-3 mr-1" />标注</TabsTrigger>
              <TabsTrigger value="versions" className="flex-1 text-[11px] rounded-none"><GitBranch className="h-3 w-3 mr-1" />版本</TabsTrigger>
              <TabsTrigger value="history" className="flex-1 text-[11px] rounded-none"><History className="h-3 w-3 mr-1" />历史</TabsTrigger>
            </TabsList>
            <TabsContent value="video" className="flex-1 m-0 min-h-0"><VideoPlayer /></TabsContent>
            <TabsContent value="export" className="flex-1 m-0 min-h-0">
              <ExportMetadataPanel />
            </TabsContent>
            <TabsContent value="versions" className="flex-1 m-0 min-h-0">
              <VersionTimeline
                promptId={currentPromptId}
                onSelectVersion={(v) => {
                  useAppStore.getState().setParams({
                    prompt: v.prompt,
                    negative_prompt: v.negative_prompt,
                    model_name: (v.model_name || "kling-v3") as ModelName,
                    mode: (v.mode || "std") as Mode,
                    duration: (v.duration || "5") as Duration,
                    aspect_ratio: (v.aspect_ratio || "16:9") as AspectRatio,
                    cfg_scale: v.cfg_scale || 0.5,
                  });
                  useAppStore.getState().setCurrentImage(v.reference_image || null);
                  useAppStore.getState().setCurrentLastFrame(v.last_frame_image || null);
                  setCurrentVersionId(v.id);
                  if (v.task_id) {
                    const matchingTask = history.find((task) => task.taskId === v.task_id);
                    useAppStore.getState().setCurrentTask(matchingTask || {
                      id: v.id,
                      promptId: "",
                      taskId: v.task_id,
                      status: (v.task_status as "submitted" | "processing" | "succeed" | "failed") || "submitted",
                      videoUrl: v.video_url || undefined,
                      startedAt: new Date(v.created_at).getTime(),
                    });
                  }
                  setRightTab("video");
                }}
              />
            </TabsContent>
            <TabsContent value="history" className="flex-1 m-0 min-h-0">
              <TaskHistory onSwitchToVideo={() => setRightTab("video")} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <BatchImport open={importOpen} onOpenChange={setImportOpen} groupName={activeGroup} />
    </div>
  );
}
