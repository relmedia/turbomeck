"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Camera } from "lucide-react";

type ChangeAvatarFormProps = {
  currentImage: string | null;
  currentName: string | null;
};

export function ChangeAvatarForm({
  currentImage,
  currentName,
}: ChangeAvatarFormProps) {
  const { update } = useSession();
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = currentName
    ? currentName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const displayImage = preview ?? currentImage ?? undefined;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("idle");
    setErrorMessage("");

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setStatus("loading");
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(json.error ?? "Kunde inte ladda upp");
        return;
      }

      await update({ image: json.image });
      setPreview(null);
      setStatus("success");
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setStatus("error");
      setErrorMessage("Nätverksfel. Försök igen.");
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="relative">
        <Avatar className="size-20 ring-2 ring-border">
          <AvatarImage src={displayImage} alt={currentName ?? ""} />
          <AvatarFallback className="text-xl">{initials}</AvatarFallback>
        </Avatar>
        <label
          title="Byt profilbild"
          className="absolute -bottom-1 -right-1 flex size-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          <Camera className="size-4" />
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="sr-only"
            onChange={handleFileChange}
            disabled={status === "loading"}
          />
        </label>
      </div>
      {status === "success" && (
        <p className="text-sm text-emerald-600">Profilbilden är uppdaterad.</p>
      )}
      {status === "error" && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
