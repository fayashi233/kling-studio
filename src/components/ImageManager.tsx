"use client";

import { useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePlus, X, Link, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ImageRecord } from "@/types";

export function ImageManager() {
  const { currentImage, setCurrentImage, images, setImages } = useAppStore();
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshImages = async () => {
    const res = await fetch("/api/images");
    setImages(await res.json());
  };

  const handleUpload = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/images", { method: "POST", body: formData });
      const data = await res.json();
      if (data.path) {
        setCurrentImage(data.path);
        refreshImages();
      }
    },
    [setCurrentImage]
  );

  const handleDelete = useCallback(
    async (id: string, path: string) => {
      await fetch("/api/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // If deleted image was the current one, clear it
      if (currentImage === path) setCurrentImage(null);
      refreshImages();
    },
    [currentImage, setCurrentImage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) handleUpload(file);
    },
    [handleUpload]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleUpload(file);
        }
      }
    },
    [handleUpload]
  );

  const handleUrlAdd = () => {
    if (urlInput.trim()) {
      setCurrentImage(urlInput.trim());
      setUrlInput("");
      setShowUrlInput(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">参考图</Label>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => setShowUrlInput(!showUrlInput)}>
            <Link className="h-3 w-3 mr-1" />URL
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-3 w-3 mr-1" />上传
          </Button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />

      {showUrlInput && (
        <div className="flex gap-1">
          <Input placeholder="输入图片 URL..." value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrlAdd()} className="h-7 text-xs" />
          <Button size="sm" className="h-7 px-2" onClick={handleUrlAdd}>确定</Button>
        </div>
      )}

      {/* Current Image Preview */}
      {currentImage ? (
        <div className="relative rounded-md overflow-hidden border group"
          onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onPaste={handlePaste} tabIndex={0}>
          <img src={currentImage} alt="参考图" className="w-full h-32 object-cover" />
          <Button variant="destructive" size="sm"
            className="absolute top-1 right-1 h-6 w-6 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            onClick={() => setCurrentImage(null)}>
            <X className="h-3 w-3" />
          </Button>
          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate">
            {currentImage.length > 60 ? currentImage.substring(0, 60) + "..." : currentImage}
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-accent/50 transition-colors"
          onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onPaste={handlePaste}
          tabIndex={0} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">拖拽/粘贴/点击上传</p>
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {images.map((img: ImageRecord) => (
            <div key={img.id}
              className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 transition-colors group ${
                currentImage === img.path ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
              }`}
              onClick={() => setCurrentImage(img.path)}>
              <img src={img.path} alt={img.label} className="w-full h-full object-cover" />
              <Button variant="destructive" size="sm"
                className="absolute top-0.5 right-0.5 h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); handleDelete(img.id, img.path); }}>
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
