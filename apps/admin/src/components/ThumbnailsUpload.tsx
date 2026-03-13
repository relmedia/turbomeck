"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Loader2, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import Image from "next/image";
import { PRODUCT_API } from "@/lib/product-api";
import { resolveImageUrl } from "@/lib/image-utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ThumbnailsUploadProps {
  value?: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}

export function ThumbnailsUpload({ value = [], onChange, disabled }: ThumbnailsUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [deleteConfirmUrl, setDeleteConfirmUrl] = useState<string | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadExistingUploads = async () => {
    setLoadingExisting(true);
    setError(null);
    try {
      const res = await fetch(`${PRODUCT_API}/upload`);
      const data = res.ok ? await res.json() : {};
      const files: string[] = data.files ?? [];
      setExistingFiles([...new Set(files)]);
    } catch {
      setExistingFiles([]);
      setError("Kunde inte hämta bilder från lagret.");
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

  const handleDeleteFromStorage = async (url: string) => {
    setDeleteConfirmUrl(null);
    setDeletingUrl(url);
    setError(null);
    try {
      const filename = url.split("/").pop()?.split("?")[0] || url.replace(/^.*[/\\]/, "");
      const res = await fetch(`${PRODUCT_API}/upload/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunde inte ta bort bilden.");
      }
      setExistingFiles((prev) => prev.filter((u) => u !== url));
      if (value.includes(url)) {
        onChange(value.filter((u) => u !== url));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort bilden.");
    } finally {
      setDeletingUrl(null);
    }
  };

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {value.map((url, index) => (
            <div key={`${url}-${index}`} className="relative group">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-muted border">
                <Image
                  src={resolveImageUrl(url)}
                  alt={`Thumbnail ${index + 1}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-6 w-6 cursor-pointer"
                  onClick={() => handleRemove(index)}
                  disabled={disabled || isUploading}
                  title="Ta bort"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
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
              <p className="text-xs text-muted-foreground">eller dra och släpp</p>
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
              size="sm"
              className="w-full sm:w-auto shrink-0"
              disabled={disabled || isUploading}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Välj från uppladdningar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[446px] max-w-[calc(100vw-2rem)] p-0" align="start">
            <div className="p-2 border-b flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Bilder i lagret</p>
                <p className="text-xs text-muted-foreground">
                  {existingFiles.length} {existingFiles.length === 1 ? "bild" : "bilder"} • Klicka för att lägga till
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 shrink-0"
                disabled={loadingExisting}
                onClick={(e) => { e.stopPropagation(); loadExistingUploads(); }}
                title="Ladda om"
              >
                {loadingExisting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
              {loadingExisting ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : existingFiles.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Inga bilder hittades. Ladda upp bilder först.</p>
              ) : (
                <>
                <div className="grid grid-cols-3 gap-2">
                  {existingFiles.map((url) => {
                    const alreadyAdded = value.includes(url);
                    const isDeleting = deletingUrl === url;
                    return (
                      <div
                        key={url}
                        className={`relative aspect-square rounded-md overflow-hidden border transition-opacity group ${
                          alreadyAdded ? "opacity-50" : "hover:opacity-90 cursor-pointer"
                        } ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}
                        onClick={() => !alreadyAdded && !isDeleting && handleAddExisting(url)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !alreadyAdded && !isDeleting) {
                            e.preventDefault();
                            handleAddExisting(url);
                          }
                        }}
                      >
                        <Image
                          src={resolveImageUrl(url)}
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
                        <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmUrl(url);
                            }}
                            disabled={isDeleting || disabled}
                            title="Ta bort från lagret"
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <AlertDialog open={!!deleteConfirmUrl} onOpenChange={(open) => !open && setDeleteConfirmUrl(null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Ta bort bild från lagret?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Bilden tas bort permanent från lagret. Om den används av en produkt kommer den att visas som trasig.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={!!deletingUrl}>Avbryt</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteConfirmUrl && handleDeleteFromStorage(deleteConfirmUrl)}
                        disabled={!!deletingUrl}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Ta bort
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
