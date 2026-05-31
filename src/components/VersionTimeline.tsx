"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { GitBranch, Play, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Version {
  id: string;
  parent_id: string;
  prompt: string;
  negative_prompt: string;
  model_name: string;
  mode: string;
  duration: string;
  aspect_ratio: string;
  cfg_scale: number;
  reference_image: string;
  task_id: string;
  video_url: string;
  task_status: string;
  created_at: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  submitted: <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />,
  processing: <Loader2 className="h-3 w-3 text-yellow-500 animate-spin" />,
  succeed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  failed: <XCircle className="h-3 w-3 text-red-500" />,
};

function buildTree(versions: Version[]): Version[] {
  // Return versions in reverse chronological order (newest first)
  // but maintain parent-child relationships for display
  return [...versions].reverse();
}

export function VersionTimeline({
  onSelectVersion,
}: {
  onSelectVersion: (v: Version) => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/versions");
      const data = await res.json();
      if (Array.isArray(data)) setVersions(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchVersions();
    const interval = setInterval(fetchVersions, 10000);
    return () => clearInterval(interval);
  }, [fetchVersions]);

  const handleSelect = (v: Version) => {
    setActiveId(v.id);
    onSelectVersion(v);
  };

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
        <GitBranch className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-xs">暂无版本记录</p>
        <p className="text-[10px] mt-1">生成视频后自动创建版本</p>
      </div>
    );
  }

  const tree = buildTree(versions);

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-0">
        {tree.map((v, i) => {
          const isActive = activeId === v.id;
          const hasVideo = v.video_url && v.task_status === "succeed";
          const isBranch = v.parent_id && tree.some((t) => t.id === v.parent_id);

          return (
            <div key={v.id} className="flex gap-2">
              {/* Timeline line */}
              <div className="flex flex-col items-center w-5 flex-shrink-0">
                <div className={`w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 ${
                  isActive ? "border-primary bg-primary" :
                  hasVideo ? "border-green-500 bg-green-500" :
                  v.task_status === "failed" ? "border-red-500 bg-red-500" :
                  "border-muted-foreground/30 bg-background"
                }`} />
                {i < tree.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[20px] ${
                    isBranch ? "bg-orange-400" : "bg-border"
                  }`} />
                )}
              </div>

              {/* Version content */}
              <div
                className={`flex-1 p-2 rounded-md border mb-1 cursor-pointer transition-colors ${
                  isActive
                    ? "bg-primary/10 border-primary"
                    : "bg-card hover:bg-accent/50 border-transparent"
                }`}
                onClick={() => handleSelect(v)}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {STATUS_ICON[v.task_status] || <Clock className="h-3 w-3 text-muted-foreground" />}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(v.created_at).toLocaleTimeString()}
                  </span>
                  {isBranch && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-orange-600 border-orange-300">
                      分支
                    </Badge>
                  )}
                  {hasVideo && (
                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0 ml-auto"
                      onClick={(e) => { e.stopPropagation(); handleSelect(v); }}>
                      <Play className="h-2.5 w-2.5 text-green-600" />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] line-clamp-2 leading-relaxed text-foreground/80">
                  {v.prompt}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[9px] text-muted-foreground">{v.model_name}</span>
                  <span className="text-[9px] text-muted-foreground">{v.mode}</span>
                  <span className="text-[9px] text-muted-foreground">{v.duration}s</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
