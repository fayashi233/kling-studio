"use client";

import { useCallback, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImagePlus, X, Link, Trash2, Frame, Layers } from "lucide-react";
import { useState } from "react";
import type { ImageRecord } from "@/types";

export function ImageManager() {
  const {
    currentImage, setCurrentImage,
    currentLastFrame, setCurrentLastFrame,
    referenceMode, setReferenceMode,
    images, setImages,
  } = useAppStore();
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [lastFrameUrlInput, setLastFrameUrlInput] = useState("");
  const [showLastFrameUrlInput, setShowLastFrameUrlInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFrameFileRef = useRef<HTMLInputElement>(null);

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

  const handleLastFrameUpload = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/images", { method: "POST", body: formData });
      const data = await res.json();
      if (data.path) {
        setCurrentLastFrame(data.path);
        refreshImages();
      }
    },
    [setCurrentLastFrame]
  );

  const handleDelete = useCallback(
    async (id: string, path: string) => {
      await fetch("/api/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (currentImage === path) setCurrentImage(null);
      if (currentLastFrame === path) setCurrentLastFrame(null);
      refreshImages();
    },
    [currentImage, currentLastFrame, setCurrentImage, setCurrentLastFrame]
  );

  const handleUrlAdd = () => {
    if (urlInput.trim()) {
      setCurrentImage(urlInput.trim());
      setUrlInput("");
      setShowUrlInput(false);
    }
  };

  const handleLastFrameUrlAdd = () => {
    if (lastFrameUrlInput.trim()) {
      setCurrentLastFrame(lastFrameUrlInput.trim());
      setLastFrameUrlInput("");
      setShowLastFrameUrlInput(false);
    }
  };

  const fileSelectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
  };

  const lastFrameSelectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleLastFrameUpload(f);
  };

  return (
    <div className="space-y-3">
      {/* Mode Toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">参考图</Label>
        <div className="flex items-center gap-1 border rounded-md overflow-hidden">
          <button
            className={`px-2 py-0.5 text-[10px] transition-colors ${referenceMode === "single" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
            onClick={() => setReferenceMode("single")}
          >
            <Layers className="h-3 w-3 inline mr-0.5" />单图
          </button>
          <button
            className={`px-2 py-0.5 text-[10px] transition-colors ${referenceMode === "firstlast" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
            onClick={() => setReferenceMode("firstlast")}
          >
            <Frame className="h-3 w-3 inline mr-0.5" />首尾帧
          </button>
        </div>
      </div>

      {/* Single Image Mode */}
      {referenceMode === "single" && (
        <>
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

          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={fileSelectUpload} />

          {showUrlInput && (
            <div className="flex gap-1">
              <Input placeholder="输入图片 URL..." value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlAdd()} className="h-7 text-xs" />
              <Button size="sm" className="h-7 px-2" onClick={handleUrlAdd}>确定</Button>
            </div>
          )}

          <ImagePreview
            image={currentImage}
            onClear={() => setCurrentImage(null)}
            onUpload={() => fileRef.current?.click()}
            placeholder="拖拽/粘贴/点击上传"
          />
        </>
      )}

      {/* First/Last Frame Mode */}
      {referenceMode === "firstlast" && (
        <div className="space-y-3">
          {/* First Frame */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">首帧</Badge>
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
              onChange={fileSelectUpload} />

            {showUrlInput && (
              <div className="flex gap-1 mb-1">
                <Input placeholder="首帧图片 URL..." value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUrlAdd()} className="h-7 text-xs" />
                <Button size="sm" className="h-7 px-2" onClick={handleUrlAdd}>确定</Button>
              </div>
            )}

            <ImagePreview
              image={currentImage}
              onClear={() => setCurrentImage(null)}
              onUpload={() => fileRef.current?.click()}
              placeholder="拖拽或点击上传首帧"
              compact
            />
          </div>

          {/* Last Frame */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">尾帧</Badge>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => setShowLastFrameUrlInput(!showLastFrameUrlInput)}>
                  <Link className="h-3 w-3 mr-1" />URL
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => lastFrameFileRef.current?.click()}>
                  <ImagePlus className="h-3 w-3 mr-1" />上传
                </Button>
              </div>
            </div>

            <input ref={lastFrameFileRef} type="file" accept="image/*" className="hidden"
              onChange={lastFrameSelectUpload} />

            {showLastFrameUrlInput && (
              <div className="flex gap-1 mb-1">
                <Input placeholder="尾帧图片 URL..." value={lastFrameUrlInput}
                  onChange={(e) => setLastFrameUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLastFrameUrlAdd()} className="h-7 text-xs" />
                <Button size="sm" className="h-7 px-2" onClick={handleLastFrameUrlAdd}>确定</Button>
              </div>
            )}

            <ImagePreview
              image={currentLastFrame}
              onClear={() => setCurrentLastFrame(null)}
              onUpload={() => lastFrameFileRef.current?.click()}
              placeholder="拖拽或点击上传尾帧"
              compact
            />
          </div>
        </div>
      )}

      {/* Image Grid (shared) */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {images.map((img: ImageRecord) => (
            <div key={img.id}
              className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 transition-colors group ${
                currentImage === img.path ? "border-primary" :
                currentLastFrame === img.path ? "border-orange-400" :
                "border-transparent hover:border-muted-foreground/30"
              }`}
              onClick={() => setCurrentImage(img.path)}>
              <img src={img.path} alt={img.label} className="w-full h-full object-cover" />
              <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {referenceMode === "firstlast" && (
                  <Button variant="secondary" size="sm"
                    className="h-4 px-1 text-[8px] bg-orange-500 text-white hover:bg-orange-600"
                    onClick={(e) => { e.stopPropagation(); setCurrentLastFrame(img.path); }}>
                    尾帧
                  </Button>
                )}
                <Button variant="destructive" size="sm"
                  className="h-4 w-4 p-0"
                  onClick={(e) => { e.stopPropagation(); handleDelete(img.id, img.path); }}>
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImagePreview({
  image,
  onClear,
  onUpload,
  placeholder,
  compact = false,
}: {
  image: string | null;
  onClear: () => void;
  onUpload: () => void;
  placeholder: string;
  compact?: boolean;
}) {
  return image ? (
    <div className="relative rounded-md overflow-hidden border group">
      <img src={image} alt="" className={`w-full object-cover ${compact ? "h-20" : "h-32"}`} />
      <Button variant="destructive" size="sm"
        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        onClick={onClear}>
        <X className="h-3 w-3" />
      </Button>
      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate">
        {image.length > 60 ? image.substring(0, 60) + "..." : image}
      </div>
    </div>
  ) : (
    <div className="border-2 border-dashed rounded-md p-2 text-center cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onUpload}>
      <ImagePlus className={`mx-auto text-muted-foreground mb-1 ${compact ? "h-5 w-5" : "h-8 w-8"}`} />
      <p className="text-[10px] text-muted-foreground">{placeholder}</p>
    </div>
  );
}
