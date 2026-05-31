"use client";

import { useState, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/useAppStore";
import { Sparkles, Wand2, Send, Copy, RotateCcw, Plus } from "lucide-react";

const QUICK_TAGS = [
  "cinematic lighting", "slow motion", "golden hour",
  "shallow depth of field", "tracking shot", "close-up",
  "wide angle", "dramatic", "soft focus", "handheld camera",
  "aerial view", "time-lapse", "neon lights", "foggy atmosphere", "studio lighting",
];

export function PromptEditor({
  onGenerate,
  onGenerateAndSwitch,
  onSave,
  onLLMAction,
  onNewPrompt,
}: {
  onGenerate: () => void;
  onGenerateAndSwitch: () => void;
  onSave: () => void;
  onLLMAction: (action: "expand" | "optimize" | "variants", lang: string) => void;
  onNewPrompt?: () => void;
}) {
  const { params, setParams, isGenerating, llmLoading, settings } = useAppStore();
  const isDashScope = settings.provider === "dashscope";
  const [showTags, setShowTags] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [llmLang, setLlmLang] = useState<"en" | "zh">("en");

  const insertTag = useCallback(
    (tag: string) => {
      const current = params.prompt;
      setParams({ prompt: current ? `${current}, ${tag}` : tag });
    },
    [params.prompt, setParams]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Shift+Enter → 生成并跳转视频
    if (e.ctrlKey && e.shiftKey && e.key === "Enter") {
      e.preventDefault(); onGenerateAndSwitch(); return;
    }
    // Ctrl+Enter → 生成
    if (e.ctrlKey && !e.shiftKey && e.key === "Enter") {
      e.preventDefault(); onGenerate(); return;
    }
    // Ctrl+S → 保存到提示词库
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault(); onSave(); return;
    }
    // Ctrl+Z → 撤销
    if (e.ctrlKey && e.key === "z" && history.length > 0) {
      e.preventDefault();
      const idx = Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setParams({ prompt: history[idx] });
    }
  };

  const saveToHistory = () => {
    if (params.prompt && params.prompt !== history[0]) {
      setHistory((h) => [params.prompt, ...h].slice(0, 50));
      setHistoryIdx(-1);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Prompt */}
      <div className="relative">
        {onNewPrompt && (
          <button
            className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            onClick={onNewPrompt}
            title="新建提示词"
          >
            <Plus className="h-3 w-3" />新建
          </button>
        )}
        <Textarea
          placeholder="输入视频描述提示词..."
          className="min-h-[120px] resize-y text-sm leading-relaxed"
          value={params.prompt}
          onChange={(e) => setParams({ prompt: e.target.value })}
          onKeyDown={handleKeyDown}
          onBlur={saveToHistory}
        />
        <div className="absolute bottom-2 right-2 flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs opacity-60 hover:opacity-100"
            onClick={() => navigator.clipboard.writeText(params.prompt)}>
            <Copy className="h-3 w-3" />
          </Button>
          {history.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs opacity-60 hover:opacity-100"
              onClick={() => {
                if (historyIdx < history.length - 1) {
                  const idx = historyIdx + 1;
                  setHistoryIdx(idx);
                  setParams({ prompt: history[idx] });
                }
              }}>
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Quick Tags */}
      <div>
        <Button variant="ghost" size="sm" className="text-xs h-5 px-2 mb-0.5"
          onClick={() => setShowTags(!showTags)}>
          {showTags ? "隐藏" : "快捷标签"} ▾
        </Button>
        {showTags && (
          <div className="flex flex-wrap gap-1">
            {QUICK_TAGS.map((tag) => (
              <Badge key={tag} variant="outline"
                className="cursor-pointer text-[11px] hover:bg-accent transition-colors"
                onClick={() => insertTag(tag)}>
                + {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Negative Prompt */}
      {!isDashScope && (
        <Textarea
          placeholder="反向提示词 (不希望出现的内容)..."
          className="min-h-[50px] resize-y text-sm"
          value={params.negative_prompt}
          onChange={(e) => setParams({ negative_prompt: e.target.value })}
        />
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={onGenerate} disabled={isGenerating || !params.prompt.trim()} className="flex-1">
          <Send className="h-4 w-4 mr-2" />
          {isGenerating ? "生成中..." : "生成视频"}
        </Button>

        {/* Language toggle */}
        <div className="flex border rounded-md overflow-hidden">
          <button
            className={`px-2 py-1 text-[10px] transition-colors ${llmLang === "en" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
            onClick={() => setLlmLang("en")}
          >
            EN
          </button>
          <button
            className={`px-2 py-1 text-[10px] transition-colors ${llmLang === "zh" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
            onClick={() => setLlmLang("zh")}
          >
            中
          </button>
        </div>

        <Button variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => onLLMAction("expand", llmLang)}
          disabled={llmLoading || !params.prompt.trim()}>
          <Sparkles className="h-3.5 w-3.5 mr-1" />扩展
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => onLLMAction("optimize", llmLang)}
          disabled={llmLoading || !params.prompt.trim()}>
          <Wand2 className="h-3.5 w-3.5 mr-1" />优化
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => onLLMAction("variants", llmLang)}
          disabled={llmLoading || !params.prompt.trim()}>
          <Sparkles className="h-3.5 w-3.5 mr-1" />变体
        </Button>
      </div>
    </div>
  );
}
