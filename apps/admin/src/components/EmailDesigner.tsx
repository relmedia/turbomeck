"use client";

/**
 * Drag-and-drop email builder (Unlayer).
 *
 * Why this library: easy-email-pro is a paid SDK ($99+/mo) on a React 18 peer
 * dep; its free sibling states outright that it does not support React 19; and
 * the community React 19 fork compiles but crashes at runtime with React error
 * #527 (react/react-dom version mismatch) under Next 16, verified in an
 * isolated probe. Unlayer declares `react: >=16.8`, and the same probe showed
 * it mounting and exporting cleanly on React 19.1.4.
 *
 * The editor renders inside an iframe served by Unlayer. Designs and HTML are
 * stored in our own database — nothing about an order or a customer passes
 * through it, only the template being designed.
 */

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import EmailEditor, { type EditorRef, type EmailEditorProps } from "react-email-editor";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";

/** The automated emails a design can replace. Null = standalone. */
const BINDABLE = [
  { key: "", label: "Fristående (skickas för hand)" },
  { key: "ready_for_pickup", label: "Klar att hämta" },
  { key: "pickup_reminder_1", label: "Påminnelse 1" },
  { key: "pickup_reminder_2", label: "Påminnelse 2" },
  { key: "order_delivered", label: "Levererad" },
  { key: "core_return_reminder", label: "Kärnretur — påminnelse" },
];

export type DesignRecord = {
  id?: number;
  name: string;
  locale: string;
  templateKey: string | null;
  subject: string;
  design: Record<string, unknown> | null;
  html: string;
  isActive: boolean;
};

export default function EmailDesigner({ initial }: { initial: DesignRecord }) {
  const router = useRouter();
  const editorRef = useRef<EditorRef>(null);
  const [meta, setMeta] = useState(initial);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Load the saved design once the editor signals ready. Doing it earlier is
   * a no-op — the iframe has not booted — and is the usual cause of "my
   * template opened blank".
   */
  const onReady: EmailEditorProps["onReady"] = useCallback(() => {
    setReady(true);
    if (initial.design) {
      editorRef.current?.editor?.loadDesign(
        initial.design as Parameters<
          NonNullable<NonNullable<EditorRef["editor"]>["loadDesign"]>
        >[0],
      );
    }
  }, [initial.design]);

  const save = () => {
    const editor = editorRef.current?.editor;
    if (!editor) {
      toast.error("Editorn är inte redo än");
      return;
    }
    setSaving(true);
    /**
     * exportHtml gives both representations at once. Both are stored: the
     * design is the only thing Unlayer can re-open, the HTML is what is
     * actually emailed, and it cannot turn the HTML back into blocks.
     */
    editor.exportHtml(async (data) => {
      try {
        const res = await fetch("/api/settings/designs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...meta,
            templateKey: meta.templateKey || null,
            design: data.design,
            html: data.html,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; id?: number };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        toast.success("Designen sparad");
        if (!meta.id && json.id) {
          setMeta((m) => ({ ...m, id: json.id }));
          router.replace(`/settings/design/${json.id}`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Kunde inte spara");
      } finally {
        setSaving(false);
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b pb-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/settings/design")}>
          <ArrowLeft className="mr-1 size-4" aria-hidden />
          Tillbaka
        </Button>

        <div className="space-y-1">
          <Label htmlFor="d-name" className="text-xs">Namn</Label>
          <Input
            id="d-name"
            className="h-8 w-48"
            value={meta.name}
            onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="d-subject" className="text-xs">Ämnesrad</Label>
          <Input
            id="d-subject"
            className="h-8 w-64"
            value={meta.subject}
            onChange={(e) => setMeta((m) => ({ ...m, subject: e.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="d-key" className="text-xs">Ersätter</Label>
          <select
            id="d-key"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={meta.templateKey ?? ""}
            onChange={(e) => setMeta((m) => ({ ...m, templateKey: e.target.value || null }))}
          >
            {BINDABLE.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="d-locale" className="text-xs">Språk</Label>
          <select
            id="d-locale"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={meta.locale}
            onChange={(e) => setMeta((m) => ({ ...m, locale: e.target.value }))}
          >
            <option value="sv">Svenska</option>
            <option value="en">Engelska</option>
          </select>
        </div>

        {/* Activation is separate from saving on purpose: a design must not
            start replacing a tested transactional email just because someone
            pressed Spara. */}
        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="d-active"
            checked={meta.isActive}
            disabled={!meta.templateKey}
            onCheckedChange={(v) => setMeta((m) => ({ ...m, isActive: Boolean(v) }))}
          />
          <Label htmlFor="d-active" className="text-xs">
            Aktiv
            {!meta.templateKey && (
              <span className="ml-1 text-muted-foreground">(välj vad den ersätter först)</span>
            )}
          </Label>
        </div>

        <Button className="ml-auto" onClick={save} disabled={saving || !ready}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Save className="mr-2 size-4" aria-hidden />}
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <EmailEditor
          ref={editorRef}
          onReady={onReady}
          minHeight="100%"
          options={{ locale: meta.locale === "en" ? "en-US" : "sv-SE", appearance: { theme: "light" } }}
        />
      </div>
    </div>
  );
}
