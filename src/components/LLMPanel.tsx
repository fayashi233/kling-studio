"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Check } from "lucide-react";

export function LLMPanel() {
  const { llmLoading, setLlmLoading, setParams, params } = useAppStore();
  const [description, setDescription] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [lang, setLang] = useState<"en" | "zh">("en");

  const callLLM = async (action: "expand" | "optimize" | "variants") => {
    const prompt = action === "expand" ? description || params.prompt : params.prompt;
    if (!prompt.trim()) return;

    setLlmLoading(true);
    try {
      const res = await fetch("/api/llm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, prompt, count: 3, lang }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setResults(Array.isArray(data.result) ? data.result : [data.result]);
    } catch (err) {
      alert("LLM 调用失败: " + (err as Error).message);
    } finally {
      setLlmLoading(false);
    }
  };

  const applyResult = (text: string) => {
    setParams({ prompt: text });
    setResults([]);
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">LLM 辅助生成</Label>
        <div className="flex gap-1">
          <Badge
            variant={lang === "en" ? "default" : "outline"}
            className="cursor-pointer text-[10px] px-1.5 py-0 h-5"
            onClick={() => setLang("en")}
          >
            English
          </Badge>
          <Badge
            variant={lang === "zh" ? "default" : "outline"}
            className="cursor-pointer text-[10px] px-1.5 py-0 h-5"
            onClick={() => setLang("zh")}
          >
            中文
          </Badge>
        </div>
      </div>

      {/* Description Input */}
      <div className="space-y-1.5">
        <Textarea
          placeholder={lang === "zh"
            ? "简短描述你想要的视频场景，LLM 会帮你扩展为完整提示词..."
            : "Briefly describe your video scene, LLM will expand it into a full prompt..."}
          className="min-h-[60px] text-xs"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button size="sm" className="w-full h-7 text-xs"
          onClick={() => callLLM("expand")}
          disabled={llmLoading || (!description.trim() && !params.prompt.trim())}>
          <Sparkles className="h-3 w-3 mr-1" />
          {llmLoading ? (lang === "zh" ? "生成中..." : "Generating...") : (lang === "zh" ? "AI 扩展提示词" : "AI Expand Prompt")}
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" className="h-7 text-xs"
          onClick={() => callLLM("optimize")}
          disabled={llmLoading || !params.prompt.trim()}>
          {lang === "zh" ? "✨ 优化当前" : "✨ Optimize"}
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs"
          onClick={() => callLLM("variants")}
          disabled={llmLoading || !params.prompt.trim()}>
          {lang === "zh" ? "🎲 生成变体" : "🎲 Variants"}
        </Button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {lang === "zh" ? "生成结果（点击应用）" : "Results (click to apply)"}
          </Label>
          {results.map((text, i) => (
            <div key={i}
              className="p-2 rounded-md border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
              onClick={() => applyResult(text)}>
              <p className="text-xs leading-relaxed line-clamp-4">{text}</p>
              <div className="flex justify-end mt-1">
                <Button variant="ghost" size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); copyToClipboard(text, i); }}>
                  {copiedIdx === i
                    ? <Check className="h-3 w-3 text-green-500" />
                    : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
