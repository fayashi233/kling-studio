"use client";

import { useAppStore } from "@/stores/useAppStore";
import { Button } from "@/components/ui/button";
import { Download, Maximize2, RefreshCw, AlertCircle, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  submitted: { label: "排队中", color: "bg-blue-500" },
  processing: { label: "生成中", color: "bg-yellow-500" },
  succeed: { label: "完成", color: "bg-green-500" },
  failed: { label: "失败", color: "bg-red-500" },
};

// Common error messages and their user-friendly explanations
const ERROR_HINTS: Record<string, string> = {
  "InvalidParameter": "参数错误，请检查模型名、时长、分辨率等配置",
  "url error": "图片 URL 无效，请检查参考图是否正确上传",
  "Model not exist": "模型不存在，请检查模型名称是否正确",
  "not activated": "服务未开通，请在百炼控制台开通视频生成服务",
  "insufficient": "余额不足或配额用完",
  "rate limit": "请求过于频繁，请稍后再试",
  "timeout": "生成超时，可能是视频太复杂，请尝试简化提示词",
  "content filtered": "内容被过滤，请修改提示词",
  "invalid api key": "API Key 无效，请检查设置中的密钥配置",
  "authentication": "认证失败，请检查 API Key 是否正确",
};

function getErrorHint(errorMsg: string): string {
  if (!errorMsg) return "";
  for (const [key, hint] of Object.entries(ERROR_HINTS)) {
    if (errorMsg.toLowerCase().includes(key.toLowerCase())) {
      return hint;
    }
  }
  return "";
}

export function VideoPlayer() {
  const { currentTask, isGenerating } = useAppStore();
  const [copied, setCopied] = useState(false);

  const status = currentTask?.status;
  const videoUrl = currentTask?.videoUrl;
  const errorMsg = currentTask?.errorMsg;
  const statusInfo = status ? STATUS_LABELS[status] : null;
  const errorHint = errorMsg ? getErrorHint(errorMsg) : "";

  const copyError = () => {
    if (errorMsg) {
      navigator.clipboard.writeText(errorMsg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Video Area */}
      <div className="flex-1 flex items-center justify-center bg-black/5 rounded-lg overflow-hidden relative min-h-0">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            className="max-w-full max-h-full object-contain"
          />
        ) : status === "failed" ? (
          /* Error State */
          <div className="flex flex-col items-center gap-3 p-6 max-w-full">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-sm font-medium text-red-600">生成失败</p>

            {/* Error message */}
            {errorMsg && (
              <div className="w-full p-3 bg-red-500/5 border border-red-200 rounded-md">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-red-700 break-all flex-1">{errorMsg}</p>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0"
                    onClick={copyError}>
                    {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                {errorHint && (
                  <p className="text-xs text-red-600 mt-2 pt-2 border-t border-red-200">
                    💡 {errorHint}
                  </p>
                )}
              </div>
            )}

            <Button variant="outline" size="sm" className="text-xs"
              onClick={() => useAppStore.getState().setCurrentTask(null)}>
              关闭
            </Button>
          </div>
        ) : isGenerating ? (
          /* Loading State */
          <div className="flex flex-col items-center gap-4 p-8">
            <div className="animate-spin h-10 w-10 border-2 border-primary border-t-transparent rounded-full" />
            <p className="text-sm text-muted-foreground">正在生成视频...</p>
            {statusInfo && (
              <Badge variant="secondary" className="text-xs">
                <span className={`w-2 h-2 rounded-full mr-1.5 ${statusInfo.color}`} />
                {statusInfo.label}
              </Badge>
            )}
            <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{
                  width: status === "submitted" ? "15%" : status === "processing" ? "60%" : "0%"
                }}
              />
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center gap-3 p-8 text-muted-foreground">
            <div className="w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center">
              <span className="text-3xl">🎬</span>
            </div>
            <p className="text-sm">输入提示词并点击生成</p>
            <p className="text-xs">Ctrl+Enter 生成 · Ctrl+Shift+Enter 生成并预览</p>
          </div>
        )}
      </div>

      {/* Video Info Bar */}
      {currentTask && status !== "failed" && (
        <div className="flex items-center justify-between p-2 border-t">
          <div className="flex items-center gap-2">
            {statusInfo && (
              <Badge variant="secondary" className="text-xs">
                <span className={`w-2 h-2 rounded-full mr-1 ${statusInfo.color}`} />
                {statusInfo.label}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {currentTask.taskId.slice(0, 16)}
            </span>
          </div>
          <div className="flex gap-1">
            {videoUrl && (
              <>
                <Button variant="ghost" size="sm" className="h-7"
                  onClick={() => window.open(videoUrl, "_blank")}>
                  <Download className="h-3.5 w-3.5 mr-1" />下载
                </Button>
                <Button variant="ghost" size="sm" className="h-7"
                  onClick={() => {
                    const el = document.querySelector("video");
                    if (el?.requestFullscreen) el.requestFullscreen();
                  }}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
