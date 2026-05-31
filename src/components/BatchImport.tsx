"use client";

import { useState, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Check } from "lucide-react";

export function BatchImport({
  open,
  onOpenChange,
  groupName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName?: string | null;
}) {
  const { setSavedPrompts } = useAppStore();
  const [content, setContent] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => setContent(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".md") || file.name.endsWith(".txt") || file.name.endsWith(".markdown"))) {
      readFile(file);
    }
  };

  const handleImport = async () => {
    if (!content.trim()) return;
    setImporting(true);
    try {
      const res = await fetch("/api/prompts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, group_name: groupName || "" }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setResult(data.imported);
      // Refresh prompts list
      const listRes = await fetch("/api/prompts");
      const listData = await listRes.json();
      setSavedPrompts(listData);
    } catch (err) {
      alert("导入失败: " + (err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setContent("");
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>批量导入提示词</DialogTitle>
          <DialogDescription>
            从 Markdown 文件或文本批量导入提示词
            {groupName && (
              <span className="ml-1 text-primary font-medium">→ 导入到「{groupName}」</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file">
          <TabsList className="w-full">
            <TabsTrigger value="file" className="flex-1">
              <FileText className="h-3.5 w-3.5 mr-1" />
              文件导入
            </TabsTrigger>
            <TabsTrigger value="text" className="flex-1">
              <Upload className="h-3.5 w-3.5 mr-1" />
              文本导入
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-3 mt-4">
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.markdown"
              className="hidden"
              onChange={handleFileUpload}
            />
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm">拖拽或点击选择 Markdown 文件</p>
              <p className="text-xs text-muted-foreground mt-1">
                支持 .md / .txt 格式
              </p>
            </div>
            {content && (
              <div className="text-xs text-muted-foreground">
                已加载 {content.split("\n").filter((l) => l.trim()).length}{" "}
                行内容
              </div>
            )}
          </TabsContent>

          <TabsContent value="text" className="mt-4">
            <Textarea
              placeholder={`支持以下格式：\n\n---\ntitle: 场景一\n---\n提示词内容...\n\n---\ntitle: 场景二\n---\n另一段提示词...\n\n或每行一个提示词`}
              className="min-h-[200px] text-xs font-mono"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </TabsContent>
        </Tabs>

        {result !== null ? (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-md">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-sm">成功导入 {result} 条提示词</span>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={importing || !content.trim()}>
            {importing ? "导入中..." : "开始导入"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
