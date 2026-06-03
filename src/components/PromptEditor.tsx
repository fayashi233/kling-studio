"use client";

import { useState, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/useAppStore";
import { Sparkles, Wand2, Send, Copy, RotateCcw, Plus, Film } from "lucide-react";

const QUICK_TAGS = [
  "cinematic lighting", "slow motion", "golden hour",
  "shallow depth of field", "tracking shot", "close-up",
  "wide angle", "dramatic", "soft focus", "handheld camera",
  "aerial view", "time-lapse", "neon lights", "foggy atmosphere", "studio lighting",
];

const FIRST_LAST_FRAME_TEMPLATES = [
  {
    label: "平滑过渡",
    prompt: "画面从起始帧平滑自然地过渡到结束帧，中间过程流畅连贯，运动节奏均匀，无跳变和突变",
  },
  {
    label: "动态镜头运动",
    prompt: "电影级运镜，镜头从第一帧的画面动态推进至最后一帧，具有强烈的视觉张力和节奏感，画面富有冲击力",
  },
  {
    label: "时光流逝",
    prompt: "从第一帧到最后一帧展现出时间的流动感，光线、色彩和氛围随过渡自然演化，云层流动，光影缓缓变化",
  },
  {
    label: "主体运动",
    prompt: "画面中的主体从第一帧的初始状态开始自然运动，动作流畅连贯，最终准确到达最后一帧的姿态和位置",
  },
  {
    label: "场景变换",
    prompt: "第一帧的场景逐渐演变为最后一帧的场景，过渡自然平滑，画面元素有机地出现、消失和重组",
  },
  {
    label: "推近特写",
    prompt: "镜头从第一帧的远景缓慢推近，景深逐渐变浅，聚焦收紧，最终抵达最后一帧的近距离特写画面",
  },
  {
    label: "拉远全景",
    prompt: "镜头从第一帧的特写缓慢向后拉远，视野逐渐开阔，展现更多环境元素，最终定格在最后一帧的全景画面",
  },
  {
    label: "环绕运镜",
    prompt: "摄像机环绕画面主体旋转，从第一帧的拍摄角度沿着弧形轨迹平滑过渡到最后一帧的视角",
  },
  {
    label: "日夜交替",
    prompt: "从第一帧的日间景象自然过渡到最后一帧的夜间景象，天空光线逐渐变暗，灯光和星光依次亮起",
  },
  {
    label: "季节更替",
    prompt: "从第一帧的季节景致随时间推移过渡到最后一帧的季节，植被色彩、天气和光影发生相应的自然变化",
  },
  {
    label: "光影流动",
    prompt: "光线从第一帧的照明状态自然漂移到最后一帧的光影布局，阴影柔和移动，高光渐次变换，氛围连贯统一",
  },
  {
    label: "粒子消散汇聚",
    prompt: "第一帧的画面如粒子般优雅消散，随后重新汇聚组合成最后一帧的画面，过程充满梦幻感和艺术张力",
  },
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
  const [showTemplates, setShowTemplates] = useState(false);
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

  const insertTemplate = useCallback(
    (template: string) => {
      const current = params.prompt;
      setParams({ prompt: current ? `${current}。${template}` : template });
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

      {/* First-Last Frame Templates */}
      <div>
        <Button variant="ghost" size="sm" className="text-xs h-5 px-2 mb-0.5"
          onClick={() => setShowTemplates(!showTemplates)}>
          <Film className="h-3 w-3 mr-1" />
          {showTemplates ? "隐藏" : "提示词"} ▾
        </Button>
        {showTemplates && (
          <div className="flex flex-wrap gap-1">
            {FIRST_LAST_FRAME_TEMPLATES.map((tpl) => (
              <Badge key={tpl.label} variant="outline"
                className="cursor-pointer text-[11px] hover:bg-primary/20 hover:border-primary/50 transition-colors"
                onClick={() => insertTemplate(tpl.prompt)}
                title={tpl.prompt}>
                <Film className="h-2.5 w-2.5 mr-1 opacity-50" />{tpl.label}
              </Badge>
            ))}
          </div>
        )}
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
