"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/stores/useAppStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Eye, EyeOff } from "lucide-react";
import type { AppSettings, ProviderId } from "@/types";
import { PROVIDERS } from "@/types";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings, setSettings } = useAppStore();
  const [local, setLocal] = useState<AppSettings>(settings);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(settings);
  }, [settings, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      setSettings(local);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleShow = (key: string) => {
    setShowKeys((s) => ({ ...s, [key]: !s[key] }));
  };

  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      const data = await res.json();
      setTestResult({ ok: data.ok, msg: data.message || (data.ok ? "连接成功" : "连接失败") });
    } catch (err) {
      setTestResult({ ok: false, msg: "请求失败: " + (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const MaskedInput = ({
    id,
    label,
    value,
    onChange,
    placeholder,
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  }) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          type={showKeys[id] ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-8"
        />
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-2"
          onClick={() => toggleShow(id)}
        >
          {showKeys[id] ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>配置视频生成 API 和 LLM 服务</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={local.provider === "dashscope" ? "dashscope" : "kling"}>
          <TabsList className="w-full">
            <TabsTrigger value="kling" className="flex-1">
              可灵官方
            </TabsTrigger>
            <TabsTrigger value="dashscope" className="flex-1">
              阿里云百炼
            </TabsTrigger>
            <TabsTrigger value="llm" className="flex-1">
              LLM
            </TabsTrigger>
          </TabsList>

          {/* Kling Official */}
          <TabsContent value="kling" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              可灵官方 API，使用 AK/SK 签名鉴权。在{" "}
              <a
                href="https://platform.klingai.com"
                target="_blank"
                rel="noopener"
                className="underline"
              >
                platform.klingai.com
              </a>{" "}
              获取密钥。
            </p>
            <MaskedInput
              id="ak"
              label="Access Key (AK)"
              value={local.kling_access_key}
              onChange={(v) => setLocal({ ...local, kling_access_key: v })}
              placeholder="输入可灵 Access Key"
            />
            <MaskedInput
              id="sk"
              label="Secret Key (SK)"
              value={local.kling_secret_key}
              onChange={(v) => setLocal({ ...local, kling_secret_key: v })}
              placeholder="输入可灵 Secret Key"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setLocal({ ...local, provider: "kling-official" })}
            >
              设为当前服务商
            </Button>
          </TabsContent>

          {/* DashScope */}
          <TabsContent value="dashscope" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              阿里云百炼 DashScope API，支持可灵和万相系列模型。在{" "}
              <a
                href="https://bailian.console.aliyun.com"
                target="_blank"
                rel="noopener"
                className="underline"
              >
                百炼控制台
              </a>{" "}
              获取 API Key。
            </p>
            <MaskedInput
              id="dashscope_key"
              label="DashScope API Key"
              value={local.dashscope_api_key}
              onChange={(v) => setLocal({ ...local, dashscope_api_key: v })}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <div className="space-y-1.5">
              <Label className="text-xs">
                Base URL <span className="text-muted-foreground">(可选)</span>
              </Label>
              <Input
                value={local.dashscope_base_url}
                onChange={(e) =>
                  setLocal({ ...local, dashscope_base_url: e.target.value })
                }
                placeholder="https://dashscope.aliyuncs.com/api/v1"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setLocal({ ...local, provider: "dashscope" })}
            >
              设为当前服务商
            </Button>
          </TabsContent>

          {/* LLM */}
          <TabsContent value="llm" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label className="text-xs">LLM 服务商</Label>
              <Select
                value={local.llm_provider}
                onValueChange={(v) =>
                  setLocal({
                    ...local,
                    llm_provider: v as AppSettings["llm_provider"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="claude">Claude (Anthropic)</SelectItem>
                  <SelectItem value="custom">自定义 (OpenAI 兼容)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <MaskedInput
              id="llm"
              label="API Key"
              value={local.llm_api_key}
              onChange={(v) => setLocal({ ...local, llm_api_key: v })}
              placeholder="输入 LLM API Key"
            />

            <div className="space-y-1.5">
              <Label className="text-xs">
                Base URL{" "}
                <span className="text-muted-foreground">(可选)</span>
              </Label>
              <Input
                value={local.llm_base_url}
                onChange={(e) =>
                  setLocal({ ...local, llm_base_url: e.target.value })
                }
                placeholder={
                  local.llm_provider === "claude"
                    ? "https://api.anthropic.com/v1"
                    : "https://api.openai.com/v1"
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">模型名称</Label>
              <Input
                value={local.llm_model}
                onChange={(e) =>
                  setLocal({ ...local, llm_model: e.target.value })
                }
                placeholder={
                  local.llm_provider === "claude"
                    ? "claude-sonnet-4-20250514"
                    : "gpt-4o-mini"
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Test result */}
        {testResult && (
          <div className={`p-2 rounded-md text-xs ${testResult.ok ? "bg-green-500/10 text-green-700" : "bg-red-500/10 text-red-700"}`}>
            {testResult.msg}
          </div>
        )}

        <div className="flex justify-between items-center mt-4">
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? "测试中..." : "测试连接"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "保存中..." : "保存设置"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
