"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Loader2, FolderOpen, Eraser } from "lucide-react";
import Image from "next/image";
import { PRODUCT_API } from "@/lib/product-api";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ThumbnailsUploadProps {
  value?: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}

export function ThumbnailsUpload({ value = [], onChange, disabled }: ThumbnailsUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [removingBgIndex, setRemovingBgIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRemoveBackground = async (index: number) => {
    const url = value[index];
    if (!url) return;
    setRemovingBgIndex(index);
    setError(null);
    try {
      const res = await fetch(`${PRODUCT_API}/upload/remove-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunde inte ta bort bakgrund.");
      }
      const data = await res.json();
      const next = [...value];
      next[index] = data.url;
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort bakgrund.");
    } finally {
      setRemovingBgIndex(null);
    }
  };

  const loadExistingUploads = async () => {
    setLoadingExisting(true);
    try {
      const res = await fetch(`${PRODUCT_API}/upload`);
      if (res.ok) {
        const data = await res.json();
        setExistingFiles(data.files ?? []);
      }
    } catch {
      setExistingFiles([]);
    } finally {
      setLoadingExisting(false);
    }
  };

  const handleAddExisting = (url: string) => {
    if (!value.includes(url)) {
      onChange([...value, url]);
    }
    setBrowseOpen(false);
  };

  const handleUpload = async (file: File) => {
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Endast JPEG, PNG, GIF och WebP är tillåtna.");
      return;
    }
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
      onChange([...value, data.url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uppladdning misslyckades");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {value.map((url, index) => (
            <div key={`${url}-${index}`} className="relative group">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-muted border">
                <Image
                  src={url}
                  alt={`Thumbnail ${index + 1}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-6 w-6 cursor-pointer"
                  onClick={() => handleRemoveBackground(index)}
                  disabled={disabled || isUploading || removingBgIndex === index}
                  title="Ta bort bakgrund"
                >
                  {removingBgIndex === index ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Eraser className="w-3 h-3" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-6 w-6 cursor-pointer"
                  onClick={() => handleRemove(index)}
                  disabled={disabled || isUploading || removingBgIndex === index}
                  title="Ta bort"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div
          className={`
            flex flex-1 flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6
            transition-colors cursor-pointer min-h-[100px]
            ${disabled || isUploading ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50"}
            border-muted-foreground/25
          `}
          onClick={() => !disabled && !isUploading && inputRef.current?.click()}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Laddar upp...</p>
            </>
          ) : (
            <>
              <div className="p-2 rounded-full bg-muted">
                <Plus className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Lägg till thumbnail
              </p>
            </>
          )}
          <Input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || isUploading}
          />
        </div>

        <Popover open={browseOpen} onOpenChange={(open) => {
          setBrowseOpen(open);
          if (open) loadExistingUploads();
        }}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={disabled || isUploading}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Välj från uppladdningar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <div className="p-2 border-b">
              <p className="text-sm font-medium">Filer i upload-mappen</p>
              <p className="text-xs text-muted-foreground">Klicka för att lägga till</p>
            </div>
            <div className="max-h-[280px] overflow-y-auto p-2">
              {loadingExisting ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : existingFiles.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Inga bilder hittades</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {existingFiles.map((url) => {
                    const alreadyAdded = value.includes(url);
                    return (
                      <button
                        key={url}
                        type="button"
                        onClick={() => !alreadyAdded && handleAddExisting(url)}
                        disabled={alreadyAdded}
                        className={`relative aspect-square rounded-md overflow-hidden border transition-opacity ${
                          alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:opacity-90 cursor-pointer"
                        }`}
                      >
                        <Image
                          src={url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="80px"
                          unoptimized
                        />
                        {alreadyAdded && (
                          <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs">
                            Tillagd
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
