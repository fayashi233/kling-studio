"use client";

import { useAppStore } from "@/stores/useAppStore";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Play, RefreshCw } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-500",
  processing: "bg-yellow-500 animate-pulse",
  succeed: "bg-green-500",
  failed: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "排队", processing: "生成中", succeed: "完成", failed: "失败",
};

export function TaskHistory({ onSwitchToVideo }: { onSwitchToVideo?: () => void }) {
  const { history, setCurrentTask, savedPrompts } = useAppStore();

  const getPromptText = (promptId: string) => {
    const p = savedPrompts.find((sp) => sp.id === promptId);
    return p?.prompt || "";
  };

  const handleClick = (task: (typeof history)[0]) => {
    setCurrentTask(task);
    onSwitchToVideo?.();
  };

  const handleRefresh = async (taskId: string) => {
    try {
      const res = await fetch(`/api/kling/status/${taskId}`);
      const data = await res.json();
      if (data.task_status) {
        useAppStore.getState().updateHistoryTask(taskId, {
          status: data.task_status,
          videoUrl: data.task_result?.videos?.[0]?.url,
          errorMsg: data.task_status_msg,
        });
      }
    } catch { /* ignore */ }
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <p className="text-sm">暂无生成记录</p>
        <p className="text-xs mt-1">生成视频后将在此显示</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-1.5">
        {history.map((task) => {
          const promptText = getPromptText(task.promptId);
          return (
            <div
              key={task.id}
              className="p-2 rounded-md border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => handleClick(task)}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] || "bg-gray-400"}`} />
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {STATUS_LABELS[task.status] || task.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground truncate flex-1">
                  {task.taskId.slice(0, 12)}
                </span>
                {task.status === "processing" && (
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                    onClick={(e) => { e.stopPropagation(); handleRefresh(task.taskId); }}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
                {task.videoUrl && (
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                    onClick={(e) => { e.stopPropagation(); handleClick(task); }}>
                    <Play className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {promptText && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{promptText}</p>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
