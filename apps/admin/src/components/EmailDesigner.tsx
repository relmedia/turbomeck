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

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import EmailEditor, { type EditorRef, type EmailEditorProps } from "react-email-editor";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { Loader2, Save, ArrowLeft, Braces, Copy, Send, Sparkles } from "lucide-react";
import { toast } from "react-toastify";

/** The automated emails a design can replace. Null = standalone. */
const BINDABLE = [
  { key: "", label: "Fristående (skickas för hand)" },
  { key: "order_confirmation", label: "Orderbekräftelse (tack för ditt köp)" },
  { key: "ready_for_pickup", label: "Klar att hämta" },
  { key: "pickup_reminder_1", label: "Påminnelse 1" },
  { key: "pickup_reminder_2", label: "Påminnelse 2" },
  { key: "order_delivered", label: "Levererad" },
  { key: "core_return_reminder", label: "Kärnretur — påminnelse" },
  { key: "magic_link", label: "Inloggningslänk (logga in)" },
];

/** What `/api/settings/designs/merge-tags` hands back. */
type MergeTagGroups = Record<
  string,
  { name: string; mergeTags: Record<string, { name: string; value: string; sample?: string }> }
>;
type MergeTagDef = { token: string; label: string; group: string; kind: "scalar" | "block"; sample: string };

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
  const [tags, setTags] = useState<{ groups: MergeTagGroups; tags: MergeTagDef[] } | null>(null);
  const [showTags, setShowTags] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  /**
   * The token catalogue comes from product-service, where the substitution
   * that fills the tokens in also lives. Fetched rather than hardcoded here:
   * a second copy in admin could offer a token nothing replaces, and that
   * ships as a literal "{{order_total}}" in a customer's inbox.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/designs/merge-tags", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { groups: MergeTagGroups; tags: MergeTagDef[] };
        if (!cancelled) setTags(json);
      } catch {
        /**
         * Soft failure on purpose. Without the catalogue the editor still
         * designs and saves — tokens can be typed by hand — so blocking the
         * whole page on a product-service hiccup would be the worse trade.
         */
        if (!cancelled) toast.warn("Kunde inte hämta merge-taggar — du kan skriva dem för hand");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * `options.mergeTags` is read once at init, and the fetch above usually
   * finishes after the iframe has booted. setMergeTags is the supported way to
   * push them in afterwards; it runs on whichever of the two lands last.
   */
  useEffect(() => {
    if (!ready || !tags) return;
    editorRef.current?.editor?.setMergeTags(tags.groups);
  }, [ready, tags]);

  const blockTags = tags?.tags.filter((t) => t.kind === "block") ?? [];

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

  /**
   * Generate a design from a description and load it into the canvas.
   *
   * Loaded, not saved: the admin reads it, edits it, and presses Spara if
   * they want it. Nothing reaches a customer from this button.
   *
   * The model fills in a small block spec which the server converts using the
   * verified builders — it never writes Unlayer JSON, because a design with a
   * subtly wrong shape opens blank rather than failing, and the admin would
   * read that as the feature being broken.
   */
  const generate = async () => {
    const text = aiPrompt.trim();
    if (!text) {
      toast.error("Beskriv vad mallen ska innehålla");
      return;
    }
    const editor = editorRef.current?.editor;
    if (!editor) {
      toast.error("Editorn är inte redo än");
      return;
    }
    /**
     * Replacing the canvas throws away unsaved work, so it is confirmed —
     * but only when there is something to lose. A blank new template needs
     * no ceremony.
     */
    if (meta.id && !window.confirm("Ersätt innehållet i editorn med ett nytt AI-förslag?")) {
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/settings/designs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          locale: meta.locale,
          templateKey: meta.templateKey,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        design?: Record<string, unknown>;
        subject?: string;
        warnings?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (!json.design) throw new Error("AI returnerade ingen mall");

      editor.loadDesign(
        json.design as Parameters<
          NonNullable<NonNullable<EditorRef["editor"]>["loadDesign"]>
        >[0],
      );
      /** The subject is part of the generated template, not a separate step. */
      if (json.subject) setMeta((m) => ({ ...m, subject: json.subject! }));

      toast.success("Förslaget laddades in — granska och spara");
      if (json.warnings && json.warnings.length > 0) {
        toast.warn(json.warnings.join(" · "), { autoClose: 10000 });
      }
      setShowAi(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte generera mallen");
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Mail the design as it currently stands, filled with sample data.
   *
   * Exports from the editor rather than reading the saved row, so what arrives
   * is what is on screen — unsaved edits included. That is the whole point:
   * otherwise checking a change would mean saving it first, and a half-built
   * template would have to be stored to be looked at.
   *
   * The recipient defaults to the signed-in admin server-side, so no address
   * is typed here and there is nothing to mistype.
   */
  const sendTest = () => {
    const editor = editorRef.current?.editor;
    if (!editor) {
      toast.error("Editorn är inte redo än");
      return;
    }
    setTesting(true);
    editor.exportHtml(async (data) => {
      try {
        const res = await fetch("/api/settings/designs/test-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: meta.subject,
            html: data.html,
            locale: meta.locale,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          recipient?: string;
          unknown?: string[];
        };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        toast.success(`Testmejl skickat till ${json.recipient ?? "dig"}`);
        /**
         * Unknown tokens are reported rather than silently left: a typo like
         * {{order_nummer}} renders as literal text in the mail, and seeing it
         * named here is quicker than spotting it in an inbox.
         */
        if (json.unknown && json.unknown.length > 0) {
          toast.warn(
            `Okända taggar i mallen: ${json.unknown.map((t) => `{{${t}}}`).join(", ")} — de skickas som text.`,
            { autoClose: 10000 },
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Kunde inte skicka testmejlet");
      } finally {
        setTesting(false);
      }
    });
  };

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

        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8"
          onClick={() => setShowAi((v) => !v)}
          title="Skapa ett förslag med AI"
        >
          <Sparkles className="mr-1.5 size-3.5" aria-hidden />
          AI
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={testing || !ready}
          onClick={sendTest}
          title="Skicka mallen till din egen e-post med exempeldata"
        >
          {testing ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="mr-1.5 size-3.5" aria-hidden />
          )}
          {testing ? "Skickar…" : "Skicka test"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setShowTags((v) => !v)}
        >
          <Braces className="mr-1.5 size-3.5" aria-hidden />
          Taggar
        </Button>

        <Button onClick={save} disabled={saving || !ready}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Save className="mr-2 size-4" aria-hidden />}
          {saving ? "Sparar…" : "Spara"}
        </Button>
      </div>

      {/* The AI prompt.
          Sits above the token list because the usual order is "generate
          something, then adjust it" — and the generated design already uses
          the tokens, so the reference below is the follow-up, not the start. */}
      {showAi && (
        <div className="border-b bg-muted/30 px-4 py-3">
          <label htmlFor="ai-prompt" className="text-xs font-medium">
            Beskriv mallen
          </label>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            Skriv vad mejlet ska säga och i vilken ton. AI:n fyller i rätt taggar
            åt dig — förslaget laddas in i editorn, inget sparas eller skickas
            förrän du väljer det.
          </p>
          <Textarea
            id="ai-prompt"
            rows={3}
            className="bg-background text-sm"
            placeholder={
              meta.templateKey
                ? "T.ex. Kort och varmt tack, visa produkterna och summan, och berätta att spårningsnummer kommer på mejl när vi skickat."
                : "T.ex. Ett mejl som berättar att vi har en kampanj på turbos i november, med en knapp till butiken."
            }
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={generating}
            maxLength={2000}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => void generate()} disabled={generating || !ready}>
              {generating ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" aria-hidden />
              )}
              {generating ? "Genererar…" : "Generera förslag"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAi(false)}
              disabled={generating}
            >
              Avbryt
            </Button>
            <span className="text-xs text-muted-foreground">
              {meta.locale === "en" ? "Skrivs på engelska" : "Skrivs på svenska"}
              {meta.templateKey ? " · anpassas till valt utskick" : ""}
            </span>
          </div>
        </div>
      )}

      {/* The reference list.
          The editor's own merge-tag menu (the {} button inside a text block)
          is the primary way to insert these, but it only reaches text and
          button content. Anywhere else — an image alt, a link URL, the
          subject field above, which is not Unlayer's at all — the token has to
          be pasted, so it is worth being able to copy one from here. */}
      {showTags && (
        <div className="max-h-56 overflow-y-auto border-b bg-muted/30 px-4 py-3 text-xs">
          {!tags ? (
            <p className="text-muted-foreground">Laddar taggar…</p>
          ) : (
            <>
              <p className="mb-2 text-muted-foreground">
                Infoga i en textruta med <span className="font-mono">{"{}"}</span>-knappen i
                editorn, eller kopiera och klistra in.
              </p>

              {blockTags.length > 0 && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5">
                  <p className="mb-1.5 font-medium text-amber-900">
                    Block — lägg var och en i en EGEN textruta
                  </p>
                  <p className="mb-2 text-amber-800">
                    De här expanderar till hela tabeller. Står de tillsammans med annan text i
                    samma ruta blir layouten fel i Outlook.
                  </p>
                  <div className="flex flex-col gap-1">
                    {blockTags.map((t) => (
                      <TagRow key={t.token} token={t.token} label={t.label} />
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(tags.groups)
                  .filter(([, g]) => g.name !== "Block")
                  .map(([key, g]) => (
                    <div key={key}>
                      <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">
                        {g.name}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {Object.entries(g.mergeTags).map(([token, t]) => (
                          <TagRow key={token} token={token} label={t.name} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <EmailEditor
          ref={editorRef}
          onReady={onReady}
          minHeight="100%"
          options={{
            locale: meta.locale === "en" ? "en-US" : "sv-SE",
            appearance: { theme: "light" },
            /** Set here in case the fetch beat the iframe; the effect above
                covers the usual order. Harmless either way — the later call
                replaces the same catalogue. */
            ...(tags ? { mergeTags: tags.groups } : {}),
            mergeTagsConfig: { sort: false },
          }}
        />
      </div>
    </div>
  );
}

/** One copyable token. */
function TagRow({ token, label }: { token: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const text = `{{${token}}}`;
  return (
    <button
      type="button"
      className="group flex items-center gap-1.5 text-left hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => toast.error("Kunde inte kopiera"),
        );
      }}
      title={label}
    >
      <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">{text}</code>
      <span className="truncate text-muted-foreground">{label}</span>
      {copied ? (
        <span className="text-[10px] text-green-600">kopierad</span>
      ) : (
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
      )}
    </button>
  );
}
