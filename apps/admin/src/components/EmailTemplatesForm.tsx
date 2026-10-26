"use client";

/**
 * Editor for the automated email copy.
 *
 * Deliberately plain inputs rather than the Tiptap RichTextEditor used for
 * product descriptions. These are short single-purpose strings — a subject, a
 * heading, one sentence — and Tiptap wraps everything in `<p>`, which the
 * email copy allowlist strips because the surrounding table shell already
 * provides the block structure. A WYSIWYG here would show formatting controls
 * whose output is then quietly discarded. Inline markup still works: type
 * `<strong>`, and the save route sanitises it against an inline allowlist.
 *
 * Rich editing belongs on custom-template bodies, where block structure is
 * actually wanted.
 */

import { useEffect, useState } from "react";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { Button } from "@repo/ui/components/button";
import { Loader2, RotateCcw, Eye } from "lucide-react";
import { toast } from "react-toastify";

type FieldKind = "text" | "long" | "colour" | "emoji";
type FieldDef = { key: string; label: string; kind: FieldKind; hint?: string };

/** The copy fields each template exposes, mirroring its COPY object. */
const NOTICE_FIELDS: FieldDef[] = [
  { key: "subject", label: "Ämnesrad", kind: "text", hint: "Ingen formatering — hamnar i mejlhuvudet." },
  { key: "heading", label: "Rubrik", kind: "text" },
  { key: "lead", label: "Ingress", kind: "long" },
  { key: "cta", label: "Knapptext", kind: "text" },
  { key: "note", label: "Notis under knappen", kind: "long" },
  { key: "badge", label: "Ikon", kind: "emoji" },
  { key: "badgeBg", label: "Ikonbakgrund", kind: "colour", hint: "Hex, t.ex. #dcfce7" },
  { key: "accent", label: "Knappfärg", kind: "colour", hint: "Hex, t.ex. #16a34a" },
];

const COMMON_FIELDS: FieldDef[] = [
  { key: "greeting", label: "Hälsning", kind: "text" },
  { key: "orderNumber", label: "Etikett: ordernummer", kind: "text" },
  { key: "trackingNumber", label: "Etikett: spårningsnummer", kind: "text" },
  { key: "pickupPoint", label: "Etikett: hämtställe", kind: "text" },
  { key: "deadline", label: "Etikett: deadline", kind: "text" },
  { key: "questions", label: "Fot: frågor", kind: "text" },
  { key: "rights", label: "Fot: rättigheter", kind: "text" },
];

const TEMPLATES: Array<{ key: string; name: string; description: string; fields: FieldDef[] }> = [
  {
    key: "ready_for_pickup",
    name: "Klar att hämta",
    description: "Skickas när PostNord rapporterar att paketet finns hos ombudet.",
    fields: NOTICE_FIELDS,
  },
  {
    key: "pickup_reminder_1",
    name: "Påminnelse 1",
    description: "Dag 1 efter att paketet blivit hämtbart.",
    fields: NOTICE_FIELDS,
  },
  {
    key: "pickup_reminder_2",
    name: "Påminnelse 2",
    description: "Dag 2 — sista chansen innan paketet går i retur.",
    fields: NOTICE_FIELDS,
  },
  {
    key: "order_delivered",
    name: "Levererad",
    description: "Skickas när PostNord registrerat försändelsen som levererad.",
    fields: NOTICE_FIELDS,
  },
  {
    key: "core_return_reminder",
    name: "Kärnretur — påminnelse",
    description: "Skickas före deadline för retur av den gamla turbon.",
    fields: NOTICE_FIELDS,
  },
  {
    key: "shipping_common",
    name: "Gemensamma etiketter",
    description: "Används av alla fraktmejl ovan. En ändring här syns i samtliga.",
    fields: COMMON_FIELDS,
  },
];

type Overrides = Record<string, { sv?: Record<string, string>; en?: Record<string, string> }>;

export default function EmailTemplatesForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(TEMPLATES[0]!.key);
  const [overrides, setOverrides] = useState<Overrides>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/templates", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { overrides?: Overrides };
        if (!cancelled) setOverrides(data.overrides ?? {});
      } catch {
        if (!cancelled) toast.error("Kunde inte hämta mallarna");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const template = TEMPLATES.find((t) => t.key === selected) ?? TEMPLATES[0]!;
  const current = overrides[selected] ?? {};

  const setField = (locale: "sv" | "en", key: string, value: string) =>
    setOverrides((prev) => ({
      ...prev,
      [selected]: { ...prev[selected], [locale]: { ...prev[selected]?.[locale], [key]: value } },
    }));

  const save = async (reset = false) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reset
            ? { templateKey: selected, reset: true }
            : { templateKey: selected, sv: current.sv ?? {}, en: current.en ?? {} },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        overrides?: Record<string, string> | null;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      /**
       * Take the server's sanitised result back, rather than keeping what was
       * typed — otherwise the box still shows markup that was stripped on
       * save, and the next save would look like a no-op.
       */
      setOverrides((prev) => ({ ...prev, [selected]: (data.overrides as Overrides[string]) ?? {} }));
      toast.success(reset ? "Återställd till standardtext" : "Mallen sparad");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Laddar mallar…
      </div>
    );
  }

  const hasOverride = Object.keys(current.sv ?? {}).length + Object.keys(current.en ?? {}).length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-start">
      {/* Template picker */}
      <ul className="divide-y rounded-lg border bg-card">
        {TEMPLATES.map((t) => {
          const edited =
            Object.keys(overrides[t.key]?.sv ?? {}).length +
              Object.keys(overrides[t.key]?.en ?? {}).length >
            0;
          return (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => setSelected(t.key)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                  selected === t.key ? "bg-muted font-medium" : "hover:bg-muted/50"
                }`}
              >
                <span className="truncate">{t.name}</span>
                {edited && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                    title="Anpassad"
                    aria-label="Anpassad"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <div>
          <h3 className="text-sm font-semibold">{template.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Lämna ett fält tomt för att använda standardtexten. Du kan använda{" "}
            <code className="font-mono">&lt;strong&gt;</code> och länkar — annan formatering tas bort.
          </p>
        </div>

        {template.fields.map((f) => (
          <div key={f.key} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`sv-${f.key}`} className="text-xs">
                {f.label} <span className="text-muted-foreground">(svenska)</span>
              </Label>
              <FieldInput
                id={`sv-${f.key}`}
                def={f}
                value={current.sv?.[f.key] ?? ""}
                onChange={(v) => setField("sv", f.key, v)}
                disabled={saving}
              />
              {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`en-${f.key}`} className="text-xs">
                {f.label} <span className="text-muted-foreground">(engelska)</span>
              </Label>
              <FieldInput
                id={`en-${f.key}`}
                def={f}
                value={current.en?.[f.key] ?? ""}
                onChange={(v) => setField("en", f.key, v)}
                disabled={saving}
              />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {saving ? "Sparar…" : "Spara"}
            </Button>
            <Button
              type="button"
              variant="outline"
              asChild
              disabled={saving}
            >
              <a
                href={`/api/settings/templates/preview?key=${encodeURIComponent(selected)}&locale=sv`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Eye className="mr-2 size-4" aria-hidden />
                Förhandsgranska
              </a>
            </Button>
          </div>
          {hasOverride && (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              disabled={saving}
              onClick={() => void save(true)}
            >
              <RotateCcw className="mr-2 size-4" aria-hidden />
              Återställ till standard
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function FieldInput({
  id,
  def,
  value,
  onChange,
  disabled,
}: {
  id: string;
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  if (def.kind === "long") {
    return (
      <Textarea
        id={id}
        rows={3}
        value={value}
        disabled={disabled}
        placeholder="Standardtext"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (def.kind === "colour") {
    return (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder="#dcfce7"
          onChange={(e) => onChange(e.target.value)}
        />
        <span
          aria-hidden
          className="size-8 shrink-0 rounded-md border"
          style={{ backgroundColor: /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : undefined }}
        />
      </div>
    );
  }
  return (
    <Input
      id={id}
      value={value}
      disabled={disabled}
      placeholder="Standardtext"
      maxLength={def.kind === "emoji" ? 4 : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
