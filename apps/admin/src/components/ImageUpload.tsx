"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Upload, X, Loader2, ImageIcon, Eraser } from "lucide-react";
import Image from "next/image";
import { PRODUCT_API } from "@/lib/product-api";
import { resolveImageUrl, getFetchableImageUrl } from "@/lib/image-utils";

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function ImageUpload({ value, onChange, disabled }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Endast JPEG, PNG, GIF och WebP är tillåtna.");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Filen är för stor. Max 5MB.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(`${PRODUCT_API}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Uppladdning misslyckades");
      }

      const data = await response.json();
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uppladdning misslyckades");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleRemoveBackground = async () => {
    if (!value) return;
    setIsRemovingBg(true);
    setError(null);
    try {
      const res = await fetch(`${PRODUCT_API}/remove-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: getFetchableImageUrl(value) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte ta bort bakgrund.");
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort bakgrund.");
    } finally {
      setIsRemovingBg(false);
    }
  };

  const handleRemove = async () => {
    if (value) {
      // Extract filename from URL
      const filename = value.split("/").pop();
      if (filename) {
        try {
          await fetch(`${PRODUCT_API}/upload/${filename}`, {
            method: "DELETE",
          });
        } catch (err) {
          console.error("Failed to delete file from server:", err);
        }
      }
    }
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {value ? (
        <div className="relative">
          <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted border">
            <Image
              src={resolveImageUrl(value)}
              alt="Uploaded image"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
          <div className="absolute top-2 right-2 flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="cursor-pointer"
                  onClick={handleRemoveBackground}
                  disabled={disabled || isUploading || isRemovingBg}
                >
                  {isRemovingBg ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eraser className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ta bort bakgrund</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="cursor-pointer"
                  onClick={handleRemove}
                  disabled={disabled || isUploading || isRemovingBg}
                >
                  <X className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ta bort bild</TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : (
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-8
            transition-colors cursor-pointer
            ${dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
            ${disabled || isUploading ? "opacity-50 cursor-not-allowed" : ""}
          `}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && !isUploading && inputRef.current?.click()}
        >
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            {isUploading ? (
              <>
                <Loader2 className="w-10 h-10 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Laddar upp...</p>
              </>
            ) : (
              <>
                <div className="p-4 rounded-full bg-muted">
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Dra och släpp en bild här
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    eller klicka för att välja
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, GIF eller WebP (max 5MB)
                </p>
              </>
            )}
          </div>
          <Input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || isUploading}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

