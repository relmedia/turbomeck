"use client";

/**
 * Live SEO feedback while a product is being written.
 *
 * Two layers, because "as you type" and "ask a model" want different
 * mechanisms:
 *
 *  - **The score and the previews are local and instant.** They recompute on
 *    every keystroke with no network, using the same functions the product
 *    page uses to build its real title and meta description. That is what
 *    makes typing feel answered, and it keeps working when the AI is slow,
 *    rate-limited or unconfigured.
 *  - **The suggestions are debounced.** One request ~1.2 s after typing
 *    stops, aborting any in-flight call. Asking a model on every keystroke
 *    would be slow, expensive and mostly wasted on half-typed words.
 *
 * Nothing here saves anything or blocks the form. A short name is often the
 * right name, and the findings are advice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Loader2,
  Search,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { scoreSeo, TITLE_SUFFIX, type Severity } from "@/lib/seo-score";

export type SeoFields = {
  name: string;
  shortDescription: string;
  nameEn?: string;
  shortDescriptionEn?: string;
};

type NameSuggestion = { text: string; why: string; titleLength: number };

type Suggestions = {
  names: NameSuggestion[];
  shortDescription: string;
  nameEn: string;
  shortDescriptionEn: string;
  rejected?: string[];
};

const ICON: Record<Severity, typeof CheckCircle2> = {
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
};

const TONE: Record<Severity, string> = {
  good: "text-emerald-600 dark:text-emerald-500",
  warn: "text-amber-600 dark:text-amber-500",
  bad: "text-destructive",
};

export default function SeoAssistant({
  fields,
  others,
  description,
  categories,
  onApply,
}: {
  fields: SeoFields;
  /** The rest of the catalogue, for duplicate detection. Optional. */
  others?: Array<{ name: string; shortDescription?: string | null }>;
  /** Long description, sent as context only — never rewritten. */
  description?: string;
  categories?: string[];
  onApply: (patch: Partial<SeoFields>) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Off until the name is worth spending a call on. */
  const [auto, setAuto] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  /** The name a suggestion set belongs to, so a stale set is not shown. */
  const suggestedFor = useRef<string>("");

  const score = useMemo(
    () =>
      scoreSeo({
        name: fields.name,
        shortDescription: fields.shortDescription,
        nameEn: fields.nameEn,
        shortDescriptionEn: fields.shortDescriptionEn,
        others,
      }),
    [fields.name, fields.shortDescription, fields.nameEn, fields.shortDescriptionEn, others],
  );

  const fetchSuggestions = useCallback(async () => {
    const name = fields.name.trim();
    if (name.length < 3) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/suggest-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          shortDescription: fields.shortDescription,
          description,
          categories,
        }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Suggestions & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      suggestedFor.current = name;
      setSuggestions(json);
    } catch (err) {
      /** An aborted request is the user still typing, not a failure. */
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Kunde inte hämta förslag");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [fields.name, fields.shortDescription, description, categories]);

  /**
   * Debounced auto-run. Fires once the name settles and only while the admin
   * has not turned it off, and never re-fires for a name already suggested
   * for — otherwise editing the description would spend another call.
   */
  useEffect(() => {
    if (!auto) return;
    const name = fields.name.trim();
    if (name.length < 3 || name === suggestedFor.current) return;

    const timer = setTimeout(() => void fetchSuggestions(), 1200);
    return () => clearTimeout(timer);
  }, [auto, fields.name, fetchSuggestions]);

  /** Abort anything still running when the form goes away. */
  useEffect(() => () => abortRef.current?.abort(), []);

  const stale = suggestions !== null && suggestedFor.current !== fields.name.trim();

  return (
    <section className="rounded-lg border bg-muted/20 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold">Sökmotor (SEO)</h3>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            score.score >= 80
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : score.score >= 55
                ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                : "bg-destructive/10 text-destructive"
          }`}
        >
          {score.score}/100
        </span>

        <div className="ml-auto flex items-center gap-2">
          {loading && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Tänker…
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={loading || fields.name.trim().length < 3}
            onClick={() => {
              setAuto(true);
              void fetchSuggestions();
            }}
          >
            <RefreshCw className="mr-1 size-3" aria-hidden />
            {suggestions ? "Nya förslag" : "Föreslå"}
          </Button>
        </div>
      </header>

      {/* What Google will actually show. The point of the panel: the admin
          is writing a search result, not just a field. */}
      <div className="mb-3 rounded border bg-background p-2.5">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Så här kan det se ut i Google
        </p>
        <p className="truncate text-[15px] text-[#1a0dab] dark:text-blue-400">
          {score.titlePreview || `Produktnamn${TITLE_SUFFIX}`}
        </p>
        <p className="text-xs text-emerald-700 dark:text-emerald-500">turbomeck.se › products</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {score.metaPreview || "Kort beskrivning saknas."}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Titel {score.titleLength} tecken · beskrivning {score.metaLength}
        </p>
      </div>

      <ul className="space-y-1">
        {score.findings.map((f) => {
          const Icon = ICON[f.severity];
          return (
            <li key={f.id} className="flex items-start gap-1.5 text-xs">
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${TONE[f.severity]}`} aria-hidden />
              <span className={f.severity === "good" ? "text-muted-foreground" : ""}>{f.message}</span>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {suggestions && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <Sparkles className="size-3.5 text-muted-foreground" aria-hidden />
            Förslag
            {stale && (
              <span className="font-normal text-muted-foreground">
                (för ett tidigare namn — hämta nya)
              </span>
            )}
          </p>

          {suggestions.names.length > 0 && (
            <div className="space-y-1.5">
              {suggestions.names.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => onApply({ name: s.text })}
                  className="block w-full rounded border bg-background px-2.5 py-2 text-left transition-colors hover:border-foreground/30 hover:bg-muted/50"
                >
                  <span className="text-sm font-medium">{s.text}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {s.why}
                    {" · "}
                    titel {s.titleLength} tecken
                  </span>
                </button>
              ))}
            </div>
          )}

          {suggestions.shortDescription && (
            <button
              type="button"
              onClick={() => onApply({ shortDescription: suggestions.shortDescription })}
              className="mt-2 block w-full rounded border bg-background px-2.5 py-2 text-left transition-colors hover:border-foreground/30 hover:bg-muted/50"
            >
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                Kort beskrivning ({suggestions.shortDescription.length} tecken)
              </span>
              <span className="mt-0.5 block text-xs">{suggestions.shortDescription}</span>
            </button>
          )}

          {(suggestions.nameEn || suggestions.shortDescriptionEn) && (
            <button
              type="button"
              onClick={() =>
                onApply({
                  nameEn: suggestions.nameEn || undefined,
                  shortDescriptionEn: suggestions.shortDescriptionEn || undefined,
                })
              }
              className="mt-2 block w-full rounded border bg-background px-2.5 py-2 text-left transition-colors hover:border-foreground/30 hover:bg-muted/50"
            >
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                Engelska
              </span>
              {suggestions.nameEn && <span className="mt-0.5 block text-sm font-medium">{suggestions.nameEn}</span>}
              {suggestions.shortDescriptionEn && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {suggestions.shortDescriptionEn}
                </span>
              )}
            </button>
          )}

          {/* Shown rather than swallowed: a short list is otherwise
              indistinguishable from a model having nothing to say. */}
          {suggestions.rejected && suggestions.rejected.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {suggestions.rejected.length} förslag förkastades för att de ändrade
              artikelnumret.
            </p>
          )}

          <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="size-3"
            />
            Föreslå automatiskt när jag skriver
          </label>
        </div>
      )}
    </section>
  );
}
