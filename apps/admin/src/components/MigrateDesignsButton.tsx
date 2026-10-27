"use client";

/**
 * Turns the compiled email templates into editable builder designs.
 *
 * ## Why this runs in the browser
 *
 * Two representations have to be stored for every design: the design JSON,
 * which is the only thing the editor can re-open, and the HTML, which is what
 * is actually emailed. Only Unlayer can produce the second from the first, and
 * Unlayer is a browser library — there is no server-side renderer. So the
 * migration mounts a hidden editor, loads each generated design into it, and
 * exports the HTML the same way pressing Spara does.
 *
 * The alternative was to commit ~350 KB of pre-rendered HTML to the repo as a
 * build artifact. This way the HTML is produced by the same editor version the
 * admin is using, so a migrated design and a hand-built one are byte-identical
 * in shape, and the migration can be re-run after an Unlayer upgrade.
 *
 * Designs are created ACTIVE: migrating and then having to switch twelve
 * toggles on by hand is not a migration. Every one is reversible with the
 * Aktiv switch in the editor, and the compiled template remains the fallback,
 * so nothing is destroyed by running this.
 */

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import EmailEditor, { type EditorRef } from "react-email-editor";
import { Button } from "@repo/ui/components/button";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "react-toastify";

type SeedTemplate = {
  templateKey: string;
  locale: string;
  name: string;
  subject: string;
  design: Record<string, unknown>;
};

type ExistingDesign = {
  id: number;
  name: string;
  templateKey: string | null;
  locale: string;
};

export default function MigrateDesignsButton() {
  const router = useRouter();
  const editorRef = useRef<EditorRef>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const onReady = useCallback(() => setReady(true), []);

  /** Export one design to HTML through the hidden editor. */
  const exportOne = (design: Record<string, unknown>) =>
    new Promise<{ html: string; design: Record<string, unknown> }>((resolve, reject) => {
      const editor = editorRef.current?.editor;
      if (!editor) return reject(new Error("Editorn är inte redo"));

      editor.loadDesign(
        design as Parameters<NonNullable<NonNullable<EditorRef["editor"]>["loadDesign"]>>[0],
      );
      /**
       * loadDesign has no completion callback, and exporting too early yields
       * the PREVIOUS design's HTML — which would silently save the wrong body
       * to every template after the first. The delay is the only signal
       * available, so it is generous on purpose.
       */
      setTimeout(() => {
        try {
          editor.exportHtml((data) => {
            if (!data?.html?.trim()) return reject(new Error("Tom HTML från editorn"));
            resolve({
              html: data.html,
              design: data.design as unknown as Record<string, unknown>,
            });
          });
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }, 1500);
    });

  const migrate = async () => {
    setBusy(true);
    setProgress("Hämtar standardmallarna…");
    let created = 0;
    let updated = 0;

    try {
      const seedRes = await fetch("/api/settings/designs/seed", { cache: "no-store" });
      const seedJson = (await seedRes.json()) as { templates?: SeedTemplate[]; error?: string };
      if (!seedRes.ok) throw new Error(seedJson.error ?? `HTTP ${seedRes.status}`);
      const templates = seedJson.templates ?? [];
      if (templates.length === 0) throw new Error("Inga standardmallar att migrera");

      /**
       * Existing designs are looked up so a second run UPDATES its own rows
       * rather than duplicating them — that is what makes re-running this the
       * way to reset a template to standard.
       *
       * Matched on NAME as well as template and locale, so it only ever
       * overwrites a design this migration created. A design someone built and
       * named themselves keeps that name, so it is not recognised, and is left
       * untouched while the standard one is created alongside it. Matching on
       * template and locale alone would have silently replaced hand-built work
       * — there is already one such design in production.
       */
      const listRes = await fetch("/api/settings/designs", { cache: "no-store" });
      const listJson = (await listRes.json()) as { designs?: ExistingDesign[] };
      const existing = new Map(
        (listJson.designs ?? [])
          .filter((d) => d.templateKey)
          .map((d) => [`${d.templateKey}:${d.locale}:${d.name}`, d.id]),
      );

      for (let i = 0; i < templates.length; i++) {
        const t = templates[i]!;
        setProgress(`(${i + 1}/${templates.length}) ${t.name} [${t.locale}]`);

        const exported = await exportOne(t.design);
        const id = existing.get(`${t.templateKey}:${t.locale}:${t.name}`);

        const res = await fetch("/api/settings/designs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: t.name,
            locale: t.locale,
            templateKey: t.templateKey,
            subject: t.subject,
            design: exported.design,
            html: exported.html,
            isActive: true,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(`${t.name}: ${json.error ?? `HTTP ${res.status}`}`);
        if (id) updated++;
        else created++;
      }

      /**
       * Hand-built designs bound to the same events are named explicitly, so
       * the admin can see which of their own designs are now superseded by a
       * standard one and delete or re-activate them deliberately.
       */
      const untouched = (listJson.designs ?? []).filter(
        (d) =>
          d.templateKey &&
          !templates.some(
            (t) => t.templateKey === d.templateKey && t.locale === d.locale && t.name === d.name,
          ),
      );
      toast.success(
        `Klart — ${created} nya mallar skapade${updated ? `, ${updated} uppdaterade` : ""}. Alla är aktiva.`,
      );
      if (untouched.length > 0) {
        toast.info(
          `Dina egna mallar lämnades orörda: ${untouched.map((d) => `${d.name} (${d.locale})`).join(", ")}.`,
          { autoClose: 10000 },
        );
      }
      router.refresh();
    } catch (err) {
      /**
       * Partial progress is kept rather than rolled back: each template is an
       * independent row, and the designs already written are correct. Re-running
       * updates them in place, so the fix for a failure is to press the button
       * again.
       */
      toast.error(err instanceof Error ? err.message : "Migreringen misslyckades");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button variant="outline" onClick={() => void migrate()} disabled={busy || !ready}>
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <Wand2 className="mr-2 size-4" aria-hidden />
          )}
          {busy ? "Migrerar…" : "Migrera standardmallar"}
        </Button>
        {(progress || !ready) && (
          <span className="text-xs text-muted-foreground">
            {progress || "Förbereder editorn…"}
          </span>
        )}
      </div>

      {/*
        The editor has to be in the document to boot its iframe, but must not
        be seen. Positioned off-screen rather than `display:none`, which stops
        the iframe from laying out and leaves exportHtml returning nothing.
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
