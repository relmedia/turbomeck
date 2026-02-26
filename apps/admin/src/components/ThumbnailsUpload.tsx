"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Loader2 } from "lucide-react";
import Image from "next/image";

const PRODUCT_SERVICE_URL = "http://localhost:8000";

interface ThumbnailsUploadProps {
  value?: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}

export function ThumbnailsUpload({ value = [], onChange, disabled }: ThumbnailsUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

      const response = await fetch(`${PRODUCT_SERVICE_URL}/api/upload`, {
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
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleRemove(index)}
                disabled={disabled || isUploading}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`
          flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6
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

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
