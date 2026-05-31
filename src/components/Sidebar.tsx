"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Upload,
  Star,
  Trash2,
  Play,
  FolderOpen,
  Plus,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import {
  PROVIDERS,
  getModelsForProvider,
  getModelConfig,
  type ModelName,
  type Mode,
  type Duration,
  type AspectRatio,
  type ProviderId,
  type PromptRecord,
} from "@/types";

const DURATION_LABELS: Record<string, string> = {
  "3": "3秒", "5": "5秒", "10": "10秒", "15": "15秒",
};

const MODE_LABELS: Record<string, string> = {
  std: "标准", pro: "专业", "4k": "4K",
};

interface GroupInfo {
  group_name: string;
  count: number;
}

export function Sidebar({
  onOpenSettings,
  onOpenImport,
  onBatchGenerate,
  onGroupChange,
  onLoadPrompt,
}: {
  onOpenSettings: () => void;
  onOpenImport: () => void;
  onBatchGenerate: (prompts: PromptRecord[]) => void;
  onGroupChange?: (groupName: string | null) => void;
  onLoadPrompt?: (prompt: PromptRecord) => void;
}) {
  const {
    params, setParams, savedPrompts, setSavedPrompts, settings,
  } = useAppStore();

  const provider: ProviderId = settings.provider || "kling-official";
  const models = getModelsForProvider(provider);
  const modelConfig = getModelConfig(provider, params.model_name);
  const [customModel, setCustomModel] = useState("");
  const isDashScope = provider === "dashscope";

  // ── Config collapsed ──
  const [configOpen, setConfigOpen] = useState(false);

  // ── Group state ──
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [activeGroup, setActiveGroupRaw] = useState<string | null>(null);
  const setActiveGroup = (g: string | null) => {
    setActiveGroupRaw(g);
    onGroupChange?.(g);
  };
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    const dbGroups: GroupInfo[] = await res.json();
    // Merge with local-only groups (created but no prompts assigned yet)
    setGroups((prev) => {
      const localOnly = prev.filter(
        (lg) => !dbGroups.some((dg) => dg.group_name === lg.group_name)
      );
      return [...dbGroups, ...localOnly];
    });
  }, []);

  const fetchPrompts = useCallback(async () => {
    const url = activeGroup
      ? `/api/prompts?group=${encodeURIComponent(activeGroup)}`
      : "/api/prompts";
    const res = await fetch(url);
    setSavedPrompts(await res.json());
  }, [activeGroup, setSavedPrompts]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => { fetchPrompts(); }, [activeGroup, fetchPrompts]);

  const loadPrompt = (p: PromptRecord) => {
    if (onLoadPrompt) {
      onLoadPrompt(p);
    } else {
      setParams({
        prompt: p.prompt,
        negative_prompt: p.negative_prompt,
        model_name: p.model_name as ModelName,
        mode: p.mode as Mode,
        duration: p.duration as Duration,
        aspect_ratio: p.aspect_ratio as AspectRatio,
        cfg_scale: p.cfg_scale,
      });
      if (p.reference_image) useAppStore.getState().setCurrentImage(p.reference_image);
    }
  };

  const toggleFavorite = async (id: string, current: boolean) => {
    await fetch("/api/prompts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_favorite: !current }),
    });
    fetchPrompts();
  };

  const deletePrompt = async (id: string) => {
    await fetch("/api/prompts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchPrompts();
    fetchGroups();
  };

  const assignGroup = async (promptId: string, groupName: string) => {
    if (promptId) {
      // Assign a specific prompt to a group
      await fetch("/api/prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: promptId, group_name: groupName }),
      });
      setAssignTarget(null);
    }
    fetchPrompts();
    fetchGroups();
  };

  const deleteGroup = async (name: string) => {
    if (!confirm(`确定删除分组「${name}」？（提示词不会被删除）`)) return;
    await fetch("/api/groups", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (activeGroup === name) setActiveGroup(null);
    fetchGroups();
    fetchPrompts();
  };

  const handleBatchGenerate = async (groupName: string) => {
    const res = await fetch(`/api/prompts?group=${encodeURIComponent(groupName)}`);
    const prompts = await res.json();
    if (prompts.length === 0) return;
    if (!confirm(`确定批量生成「${groupName}」中的 ${prompts.length} 条提示词？`)) return;
    onBatchGenerate(prompts);
  };

  const handleModelChange = (v: ModelName) => {
    const config = getModelConfig(provider, v);
    const updates: Partial<typeof params> = { model_name: v };
    if (!config.modes.includes(params.mode)) updates.mode = config.modes[0];
    if (!config.durations.includes(params.duration)) updates.duration = config.durations[0];
    setParams(updates);
  };

  const handleModeChange = (v: Mode) => {
    const updates: Partial<typeof params> = { mode: v };
    if (!modelConfig.durations.includes(params.duration)) updates.duration = modelConfig.durations[0];
    setParams(updates);
  };

  const handleProviderChange = async (v: ProviderId) => {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: v }),
    });
    useAppStore.getState().setSettings({ provider: v });
    const newModels = getModelsForProvider(v);
    setParams({
      model_name: newModels[0].name as ModelName,
      mode: newModels[0].modes[0],
      duration: newModels[0].durations[0],
    });
  };

  const filteredPrompts = searchQuery.trim()
    ? savedPrompts.filter((p) => p.prompt.toLowerCase().includes(searchQuery.toLowerCase()))
    : savedPrompts;
  const ungroupedPrompts = filteredPrompts.filter((p) => !p.group_name);

  return (
    <div className="w-full border-r bg-muted/30 flex flex-col h-full">
      {/* ── Config Header (collapsible) ── */}
      <div className="px-3 py-2 flex-shrink-0 border-b">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs font-medium justify-start gap-2"
          onClick={onOpenSettings}
        >
          <Settings className="h-4 w-4" />
          配置 API 密钥与模型
        </Button>
        <div
          className="flex items-center justify-between mt-1.5 cursor-pointer hover:text-foreground transition-colors"
          onClick={() => setConfigOpen(!configOpen)}
        >
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              {params.model_name} · {MODE_LABELS[params.mode] || params.mode} · {params.duration}s
            </span>
          </div>
          {configOpen
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      </div>

      {/* ── Config Body ── */}
      {configOpen && (
        <div className="px-4 pb-3 space-y-3 border-b flex-shrink-0">
          {/* Provider */}
          <div className="space-y-1">
            <Label className="text-[11px]">服务商</Label>
            <Select value={provider} onValueChange={(v) => handleProviderChange(v as ProviderId)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-1">
            <Label className="text-[11px]">模型</Label>
            <Select value={params.model_name} onValueChange={(v) => handleModelChange(v as ModelName)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.name} value={m.name}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isDashScope && (
              <div className="flex gap-1 mt-1">
                <Input
                  placeholder="自定义模型名"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="h-6 text-xs"
                />
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs shrink-0"
                  onClick={() => { if (customModel.trim()) handleModelChange(customModel.trim() as ModelName); }}>
                  应用
                </Button>
              </div>
            )}
          </div>

          {/* Mode + Duration row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">模式</Label>
              <Select value={params.mode} onValueChange={(v) => handleModeChange(v as Mode)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelConfig.modes.map((m) => (
                    <SelectItem key={m} value={m}>{MODE_LABELS[m] || m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">时长</Label>
              <Select value={params.duration} onValueChange={(v) => setParams({ duration: v as Duration })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelConfig.durations.map((d) => (
                    <SelectItem key={d} value={d}>{DURATION_LABELS[d] || `${d}s`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-1">
            <Label className="text-[11px]">宽高比</Label>
            <Select value={params.aspect_ratio} onValueChange={(v) => setParams({ aspect_ratio: v as AspectRatio })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9</SelectItem>
                <SelectItem value="9:16">9:16</SelectItem>
                <SelectItem value="1:1">1:1</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* CFG Scale */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <Label className="text-[11px]">提示词强度</Label>
              <span className="text-[10px] text-muted-foreground">{params.cfg_scale.toFixed(2)}</span>
            </div>
            <Slider
              value={[params.cfg_scale]}
              onValueChange={(val) => {
                const v = Array.isArray(val) ? val[0] : val;
                setParams({ cfg_scale: typeof v === "number" ? v : 0.5 });
              }}
              min={0} max={1} step={0.05} className="h-4"
            />
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="px-4 py-2 flex gap-2 flex-shrink-0">
        <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={onOpenImport}>
          <Upload className="h-3 w-3 mr-1" />导入 MD
        </Button>
      </div>

      <Separator />

      {/* ── Prompt Library ── */}
      <div className="flex-1 min-h-0 px-4 py-2 flex flex-col">
        <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
          <h3 className="text-xs font-semibold">提示词库</h3>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
            onClick={() => { setShowNewGroup(!showNewGroup); setNewGroupName(""); }}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {/* Search */}
        <div className="mb-2 flex-shrink-0">
          <Input
            placeholder="搜索提示词..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        {/* New group input */}
        {showNewGroup && (
          <div className="flex gap-1 mb-2 flex-shrink-0">
            <Input placeholder="分组名..." value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGroupName.trim()) {
                  const name = newGroupName.trim();
                  setGroups((prev) => {
                    if (prev.some((g) => g.group_name === name)) return prev;
                    return [...prev, { group_name: name, count: 0 }];
                  });
                  setActiveGroup(name);
                  setShowNewGroup(false);
                  setNewGroupName("");
                }
              }}
              className="h-7 text-xs" autoFocus />
            <Button size="sm" className="h-7 px-2 text-xs shrink-0"
              disabled={!newGroupName.trim()}
              onClick={() => {
                const name = newGroupName.trim();
                if (!name) return;
                setGroups((prev) => {
                  if (prev.some((g) => g.group_name === name)) return prev;
                  return [...prev, { group_name: name, count: 0 }];
                });
                setActiveGroup(name);
                setShowNewGroup(false);
                setNewGroupName("");
              }}>创建</Button>
          </div>
        )}

        {/* Group filter tabs */}
        <div className="flex flex-wrap gap-1 mb-2 flex-shrink-0">
          <Badge variant={activeGroup === null ? "default" : "outline"}
            className="cursor-pointer text-[10px] px-1.5 py-0 h-5"
            onClick={() => setActiveGroup(null)}>全部</Badge>
          {groups.map((g) => (
            <Badge key={g.group_name}
              variant={activeGroup === g.group_name ? "default" : "outline"}
              className="cursor-pointer text-[10px] px-1.5 py-0 h-5"
              onClick={() => setActiveGroup(g.group_name)}>
              {g.group_name}({g.count})
            </Badge>
          ))}
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1 pr-2">
            {/* Grouped view (when "全部" selected) */}
            {activeGroup === null && groups.map((g) => {
              const expanded = expandedGroups.has(g.group_name);
              const groupPrompts = filteredPrompts.filter((p) => p.group_name === g.group_name);
              return (
                <div key={g.group_name} className="border rounded-md overflow-hidden">
                  <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/40 cursor-pointer select-none"
                    onClick={() => {
                      const next = new Set(expandedGroups);
                      if (expanded) next.delete(g.group_name); else next.add(g.group_name);
                      setExpandedGroups(next);
                    }}>
                    {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <FolderOpen className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium flex-1 truncate">{g.group_name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{g.count}</Badge>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                      onClick={(e) => { e.stopPropagation(); handleBatchGenerate(g.group_name); }}
                      title="批量生成该组">
                      <Play className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive"
                      onClick={(e) => { e.stopPropagation(); deleteGroup(g.group_name); }}
                      title="删除分组">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {expanded && (
                    <div className="p-1 space-y-0.5">
                      {groupPrompts.map((p) => (
                        <PromptItem key={p.id} p={p}
                          groups={groups}
                          assignTarget={assignTarget}
                          onLoad={() => loadPrompt(p)}
                          onToggleFav={() => toggleFavorite(p.id, !!p.is_favorite)}
                          onDelete={() => deletePrompt(p.id)}
                          onAssign={() => setAssignTarget(assignTarget === p.id ? null : p.id)}
                          onAssignGroup={(groupName) => assignGroup(p.id, groupName)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Flat view (filtered by group or ungrouped) */}
            {(activeGroup !== null ? filteredPrompts : ungroupedPrompts).map((p) => (
              <PromptItem key={p.id} p={p}
                groups={groups}
                assignTarget={assignTarget}
                onLoad={() => loadPrompt(p)}
                onToggleFav={() => toggleFavorite(p.id, !!p.is_favorite)}
                onDelete={() => deletePrompt(p.id)}
                onAssign={() => setAssignTarget(assignTarget === p.id ? null : p.id)}
                onAssignGroup={(groupName) => assignGroup(p.id, groupName)} />
            ))}

            {savedPrompts.length === 0 && (
              <p className="text-[11px] text-muted-foreground py-6 text-center">暂无提示词</p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function PromptItem({
  p, groups, assignTarget, onLoad, onToggleFav, onDelete, onAssign, onAssignGroup,
}: {
  p: PromptRecord;
  groups: GroupInfo[];
  assignTarget: string | null;
  onLoad: () => void;
  onToggleFav: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onAssignGroup: (groupName: string) => void;
}) {
  const showAssign = assignTarget === p.id;

  return (
    <div className="rounded border bg-card overflow-hidden">
      <div className="p-1.5 hover:bg-accent/50 cursor-pointer transition-colors group"
        onClick={onLoad}>
        <p className="text-[11px] line-clamp-2 leading-relaxed">{p.prompt}</p>
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground">{p.model_name}</span>
            {p.group_name && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3">{p.group_name}</Badge>
            )}
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" title="分组"
              onClick={(e) => { e.stopPropagation(); onAssign(); }}>
              <FolderOpen className="h-2.5 w-2.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0"
              onClick={(e) => { e.stopPropagation(); onToggleFav(); }}>
              <Star className={`h-2.5 w-2.5 ${p.is_favorite ? "fill-yellow-400 text-yellow-400" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Inline assign group panel */}
      {showAssign && (
        <div className="px-1.5 pb-1.5 pt-0.5 border-t bg-muted/30">
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <Badge key={g.group_name} variant="outline"
                className="cursor-pointer text-[9px] px-1 py-0 h-4 hover:bg-accent"
                onClick={(e) => { e.stopPropagation(); onAssignGroup(g.group_name); }}>
                {g.group_name}
              </Badge>
            ))}
            {p.group_name && (
              <Badge variant="outline"
                className="cursor-pointer text-[9px] px-1 py-0 h-4 hover:bg-accent text-destructive"
                onClick={(e) => { e.stopPropagation(); onAssignGroup(""); }}>
                移出
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
