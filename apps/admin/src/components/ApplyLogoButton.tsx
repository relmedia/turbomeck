"use client";

/**
 * Puts the shop's logo at the top of every email design.
 *
 * ## Why this runs in the browser
 *
 * Each design stores two things: the design JSON the editor reopens, and the
 * HTML that is actually emailed. Changing the first without regenerating the
 * second would leave the stored HTML — the thing customers receive —
 * unchanged, so the logo would appear in the editor and nowhere else.
 *
 * Only Unlayer can turn a design into that HTML, and Unlayer is a browser
 * library. So this mounts a hidden editor and, per design, loads it, asks the
 * server to insert or repoint the logo, exports the HTML and saves both
 * halves back. Same path the migration used.
 *
 * The transform itself is deliberately NOT here. It lives in product-service
 * so one implementation is shared with the verification harness that ran it
 * against the real stored designs — a copy in this component could drift from
 * the one that was tested.
 *
 * Idempotent: a design already carrying our logo is reported as unchanged and
 * skipped, so pressing the button twice costs nothing.
 */

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import EmailEditor, { type EditorRef } from "react-email-editor";
import { Button } from "@repo/ui/components/button";
import { Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "react-toastify";

type DesignRow = { id: number; name: string; locale: string };

export default function ApplyLogoButton() {
  const router = useRouter();
  const editorRef = useRef<EditorRef>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const onReady = useCallback(() => setReady(true), []);

  /** Load a design into the hidden editor and export its HTML. */
  const exportOne = (design: Record<string, unknown>) =>
    new Promise<{ html: string; design: Record<string, unknown> }>((resolve, reject) => {
      const editor = editorRef.current?.editor;
      if (!editor) return reject(new Error("Editorn är inte redo"));

      editor.loadDesign(
        design as Parameters<NonNullable<NonNullable<EditorRef["editor"]>["loadDesign"]>>[0],
      );
      /**
       * loadDesign has no completion callback, and exporting too early
       * returns the PREVIOUS design's HTML — which would save the wrong body
       * to every template after the first. The delay is the only signal
       * available, so it is generous on purpose.
       */
      setTimeout(() => {
        try {
          editor.exportHtml((data) => {
            if (!data?.html?.trim()) return reject(new Error("Tom HTML från editorn"));
            resolve({ html: data.html, design: data.design as unknown as Record<string, unknown> });
          });
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }, 1500);
    });

  const run = async () => {
    setBusy(true);
    let changed = 0;
    let skipped = 0;
    let movedImages = 0;
    const failed: string[] = [];

    try {
      setProgress("Hämtar mallar…");
      const listRes = await fetch("/api/settings/designs", { cache: "no-store" });
      const listJson = (await listRes.json()) as { designs?: DesignRow[]; error?: string };
      if (!listRes.ok) throw new Error(listJson.error ?? `HTTP ${listRes.status}`);
      const designs = listJson.designs ?? [];
      if (designs.length === 0) throw new Error("Inga mallar att uppdatera");

      for (let i = 0; i < designs.length; i++) {
        const row = designs[i]!;
        setProgress(`(${i + 1}/${designs.length}) ${row.name} [${row.locale}]`);

        try {
          /** The list omits design and html — they are tens of kilobytes. */
          const fullRes = await fetch(`/api/settings/designs?id=${row.id}`, { cache: "no-store" });
          const full = (await fullRes.json()) as {
            error?: string;
            design?: Record<string, unknown>;
            subject?: string;
            locale?: string;
            templateKey?: string | null;
            name?: string;
            isActive?: boolean;
          };
          if (!fullRes.ok) throw new Error(full.error ?? `HTTP ${fullRes.status}`);
          if (!full.design) throw new Error("mallen saknar design");

          /**
           * Move images off the third-party CDN first. This also rewrites the
           * logo to its canonical URL, which is what lets the next step tell
           * "already has our logo" from "needs one inserted".
           */
          const mirrorRes = await fetch("/api/settings/designs/mirror-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ design: full.design }),
          });
          const mirrored = (await mirrorRes.json()) as {
            error?: string;
            design?: Record<string, unknown>;
            movedToLogo?: number;
            mirrored?: number;
            failures?: string[];
          };
          if (!mirrorRes.ok) throw new Error(mirrored.error ?? `HTTP ${mirrorRes.status}`);
          if (mirrored.failures?.length) {
            failed.push(`${row.name} (bilder): ${mirrored.failures.join(", ")}`);
          }
          movedImages += (mirrored.movedToLogo ?? 0) + (mirrored.mirrored ?? 0);

          const applyRes = await fetch("/api/settings/designs/apply-logo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ design: mirrored.design ?? full.design }),
          });
          const applied = (await applyRes.json()) as {
            error?: string;
            design?: Record<string, unknown>;
            action?: string;
          };
          if (!applyRes.ok) throw new Error(applied.error ?? `HTTP ${applyRes.status}`);

          /**
           * "unchanged" means the logo was already in place — but mirroring
           * may still have rewritten image URLs, and those have to be saved.
           */
          const needsSave = applied.action !== "unchanged" || (mirrored.mirrored ?? 0) > 0 || (mirrored.movedToLogo ?? 0) > 0;
          if (!needsSave) {
            skipped++;
            continue;
          }

          const exported = await exportOne(applied.design!);

          const saveRes = await fetch("/api/settings/designs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: row.id,
              name: full.name ?? row.name,
              locale: full.locale ?? row.locale,
              templateKey: full.templateKey ?? null,
              subject: full.subject ?? "",
              design: exported.design,
              html: exported.html,
              /** Preserved: this must not quietly activate or deactivate anything. */
              isActive: Boolean(full.isActive),
            }),
          });
          const saved = (await saveRes.json().catch(() => ({}))) as { error?: string };
          if (!saveRes.ok) throw new Error(saved.error ?? `HTTP ${saveRes.status}`);
          changed++;
        } catch (err) {
          /**
           * One bad template does not abort the rest: each is an independent
           * row, and the ones already written are correct. Re-running skips
           * what succeeded, so the fix is to press the button again.
           */
          failed.push(`${row.name} (${row.locale}): ${err instanceof Error ? err.message : "fel"}`);
        }
      }

      if (changed > 0) {
        toast.success(
          `${changed} ${changed === 1 ? "mall" : "mallar"} uppdaterade` +
            (movedImages ? `, ${movedImages} bilder flyttade till egen server` : "") +
            (skipped ? `, ${skipped} var redan klara` : ""),
        );
      } else if (failed.length === 0) {
        toast.info("Alla mallar har redan logotypen");
      }
      if (failed.length > 0) {
        toast.error(`Misslyckades: ${failed.join(" · ")}`, { autoClose: 12000 });
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte uppdatera mallarna");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button variant="outline" onClick={() => void run()} disabled={busy || !ready}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <ImageIcon className="mr-2 size-4" aria-hidden />
          )}
          {busy ? "Uppdaterar…" : "Lägg till logotyp"}
        </Button>
        {(progress || !ready) && (
          <span className="text-xs text-muted-foreground">{progress || "Förbereder editorn…"}</span>
        )}
      </div>

      {/*
        The editor must be in the document to boot its iframe, but must not be
        seen. Positioned off-screen rather than display:none, which stops the
        iframe laying out and leaves exportHtml returning nothing.
      */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 -z-10 h-[600px] w-[900px] opacity-0"
      >
        <EmailEditor ref={editorRef} onReady={onReady} minHeight="600px" />
      </div>
    </>
  );
}
