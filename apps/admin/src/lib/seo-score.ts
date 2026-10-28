/**
 * Scores a product's name and short description the way Google will see them.
 *
 * Pure and synchronous, because it runs on every keystroke. Asking a model
 * what to type while someone is typing is both slow and expensive; this is
 * the layer that makes the panel feel live, and it keeps working when the AI
 * is rate-limited or switched off.
 *
 * ## What it is actually measuring
 *
 * These are not generic SEO platitudes — each one maps to a specific line in
 * this codebase:
 *
 *  - The **name** becomes the `<title>`, and the root layout appends
 *    `" | Turbomeck"` (12 characters). So the budget for the name is the
 *    SERP limit minus that, not the whole thing.
 *  - The **short description** becomes the meta description, built by
 *    `truncateAtWord(htmlToText(...), 160)` in
 *    `apps/client/src/app/products/[slug]/page.tsx`. The same two functions
 *    are imported here, so the preview is what ships rather than an
 *    approximation of it.
 *  - A name is also what the **URL slug** is derived from, which is why
 *    renaming matters beyond the title.
 *
 * Nothing here blocks saving. It is advice, and a short name is often the
 * right name — a part number is a legitimate thing to call a part.
 */

import { htmlToText, truncateAtWord } from "@repo/text";

/** What the root layout appends to every title. */
export const TITLE_SUFFIX = " | Turbomeck";

/** Where the product page cuts the meta description. */
export const META_LIMIT = 160;

/**
 * Google renders titles by pixel width, not characters, so these are
 * rules of thumb rather than hard limits: roughly 60 characters of Latin
 * text fits before truncation, and under ~35 wastes the line.
 */
export const TITLE_MIN = 45;
export const TITLE_MAX = 60;
export const META_MIN = 120;
export const META_MAX = 155;

export type Severity = "good" | "warn" | "bad";

export type Finding = {
  id: string;
  severity: Severity;
  /** Shown to the admin, in Swedish. */
  message: string;
};

export type SeoScore = {
  /** 0-100, for a single glanceable number. */
  score: number;
  findings: Finding[];
  /** What the SERP title will actually be. */
  titlePreview: string;
  titleLength: number;
  /** Byte-for-byte what the page will emit as its meta description. */
  metaPreview: string;
  metaLength: number;
};

/**
 * Words that say what the thing IS. A name without one is hard to match
 * against a search, because "TD04HL-19T Upgrade" never says "turbo".
 *
 * Drawn from the live catalogue rather than invented.
 */
const PRODUCT_TERMS = [
  "turbo", "turboaggregat", "wastegate", "aktuator", "actuator", "fläns", "flans",
  "renoveringssats", "renoverings", "sats", "kit", "slang", "packning", "adapter",
  "intercooler", "laddluftkylare", "grenrör", "grenror", "manifold", "dumpventil",
  "bov", "kompressorhjul", "turbinhus", "kärna", "karna", "core", "oljeledning",
  "pump", "ventil", "filter", "insats",
];

/**
 * Makes and model families. A buyer almost always searches with the car:
 * "turbo saab 9-3", not "TD04HL-19T".
 */
const VEHICLE_TERMS = [
  "saab", "volvo", "audi", "vw", "volkswagen", "bmw", "opel", "ford", "seat", "skoda",
  "aero", "viggen",
];

/** Normalised for matching: lowercase, punctuation to spaces. */
function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

function containsAny(haystack: string, terms: string[]): boolean {
  const n = normalise(haystack);
  return terms.some((t) => n.includes(` ${t} `) || n.includes(` ${t}`));
}

/**
 * A model or part code: a token mixing letters and digits (TD04HL, K24),
 * or a digit run of three or more (940), or a hyphenated pair (9-3, 19T).
 *
 * Used by the suggestion filter to prove a rewritten name still sells the
 * same part, which is the single most important guarantee in this feature.
 */
export function extractCodes(name: string): string[] {
  const codes = new Set<string>();
  for (const raw of name.split(/[\s,/|()]+/)) {
    const token = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!token) continue;
    const hasDigit = /\d/.test(token);
    if (!hasDigit) continue;
    const hasLetter = /\p{L}/u.test(token);
    /** A bare one- or two-digit number is a count, not a model. */
    if (!hasLetter && token.replace(/\D/g, "").length < 3) continue;
    codes.add(token.toUpperCase());
  }
  return [...codes];
}

/**
 * Whether a rewritten name still sells the same part.
 *
 * This is the guarantee the whole suggestion feature rests on. A name
 * "improved" from TD04HL-19T to TD04HL-20T lists the wrong turbo, and no
 * amount of prompt wording makes that safe to assume — so it is checked.
 *
 * Comparison is on alphanumerics only, because the extraction is deliberately
 * generous and the model legitimately reformats: `2,5T` comes out of a name
 * as `5T` and may be written back as `2.5T`; a year range `2003-2008` may be
 * typeset with an en-dash. Normalising both sides and asking for containment
 * accepts all of those while still rejecting a changed digit — `TD04HL19T`
 * is not a substring of `TD04HL20T`.
 */
const alnum = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * A digits-only hyphenated token is a PAIR or a RANGE, not one code:
 * `940-740` means two Volvo models, `2003-2008` a span of years. Each side
 * must survive, but the joining is the writer's business — "940 och 740" and
 * "2003 till 2008" are both faithful, and both would be rejected by a check
 * that demanded the token back verbatim.
 *
 * Alphanumeric codes are not split. `TD04HL-19T` and `K24-K26` are single
 * part numbers, and a suggestion that keeps only half of one is selling
 * something else.
 */
function requiredParts(code: string): string[] {
  return /^\d+-\d+$/.test(code) ? code.split("-") : [code];
}

export function missingCodes(original: string, candidate: string): string[] {
  const haystack = alnum(candidate);
  return extractCodes(original).filter((code) =>
    requiredParts(code).some((part) => !haystack.includes(alnum(part))),
  );
}

export function preservesCodes(original: string, candidate: string): boolean {
  return missingCodes(original, candidate).length === 0;
}

export type ScoreInput = {
  name: string;
  shortDescription: string;
  nameEn?: string;
  shortDescriptionEn?: string;
  /** Other products, to catch duplicates. Names and descriptions as stored. */
  others?: Array<{ name: string; shortDescription?: string | null }>;
};

/**
 * The meta description exactly as the product page will build it.
 *
 * Imported rather than reimplemented: these are the same two functions
 * `generateMetadata` calls, so what is previewed is what ships.
 */
export function metaDescriptionFor(shortDescription: string, fallbackName: string): string {
  return truncateAtWord(htmlToText(shortDescription) || fallbackName, META_LIMIT);
}

export function scoreSeo(input: ScoreInput): SeoScore {
  const name = input.name.trim();
  const findings: Finding[] = [];

  const titlePreview = name ? `${name}${TITLE_SUFFIX}` : "";
  const titleLength = titlePreview.length;
  const metaPreview = metaDescriptionFor(input.shortDescription, name);
  const metaLength = metaPreview.length;

  /* ---- the title ------------------------------------------------------- */
  if (!name) {
    findings.push({ id: "name-empty", severity: "bad", message: "Produkten saknar namn." });
  } else if (titleLength < TITLE_MIN) {
    findings.push({
      id: "title-short",
      severity: "warn",
      message: `Titeln blir ${titleLength} tecken. Google visar ~${TITLE_MAX} — du har ${TITLE_MAX - titleLength} tecken kvar att berätta vad delen passar.`,
    });
  } else if (titleLength > TITLE_MAX) {
    findings.push({
      id: "title-long",
      severity: "warn",
      message: `Titeln blir ${titleLength} tecken och kapas troligen i sökresultatet. Korta ned till ~${TITLE_MAX}.`,
    });
  } else {
    findings.push({ id: "title-ok", severity: "good", message: `Titellängden (${titleLength} tecken) ligger bra.` });
  }

  /* ---- the words a buyer types ---------------------------------------- */
  if (name) {
    if (!containsAny(name, PRODUCT_TERMS)) {
      findings.push({
        id: "no-product-term",
        severity: "warn",
        message: "Namnet säger inte vad det är. Lägg till t.ex. „turbo”, „wastegate” eller „renoveringssats”.",
      });
    }
    if (!containsAny(name, VEHICLE_TERMS)) {
      findings.push({
        id: "no-vehicle-term",
        severity: "warn",
        message: "Namnet nämner ingen bilmodell. De flesta söker med bilen, t.ex. „Saab 9-3” eller „Volvo 940”.",
      });
    }
  }

  /* ---- the meta description ------------------------------------------- */
  if (!metaPreview || metaPreview === name) {
    findings.push({
      id: "meta-missing",
      severity: "bad",
      message: "Kort beskrivning saknas, så Google får bara produktnamnet som text.",
    });
  } else if (metaLength < META_MIN) {
    findings.push({
      id: "meta-short",
      severity: "warn",
      message: `Beskrivningen blir ${metaLength} tecken av ${META_LIMIT}. Utrymmet i sökresultatet används inte fullt ut.`,
    });
  } else if (metaLength >= META_LIMIT) {
    findings.push({
      id: "meta-cut",
      severity: "warn",
      message: `Beskrivningen kapas vid ${META_LIMIT} tecken. Få med det viktigaste först.`,
    });
  } else {
    findings.push({ id: "meta-ok", severity: "good", message: `Beskrivningens längd (${metaLength} tecken) ligger bra.` });
  }

  /* ---- English --------------------------------------------------------- */
  if (!input.nameEn?.trim() || !input.shortDescriptionEn?.trim()) {
    findings.push({
      id: "no-english",
      severity: "warn",
      message: "Engelsk översättning saknas — produkten syns inte för engelska sökningar.",
    });
  }

  /* ---- duplicates ------------------------------------------------------ */
  const others = input.others ?? [];
  if (name && others.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) {
    findings.push({
      id: "dup-name",
      severity: "bad",
      message: "En annan produkt har exakt samma namn — de konkurrerar med varandra i sökresultatet.",
    });
  }
  const ownMeta = htmlToText(input.shortDescription);
  if (
    ownMeta &&
    others.some((o) => htmlToText(o.shortDescription ?? "") === ownMeta)
  ) {
    findings.push({
      id: "dup-meta",
      severity: "bad",
      message: "En annan produkt har samma korta beskrivning. Dubbletter försvagar båda sidorna.",
    });
  }

  /**
   * One number, so the panel can show a glanceable state. Weighted by how
   * much each thing actually moves a listing: a missing description costs
   * more than a missing translation.
   */
  const WEIGHT: Record<Severity, number> = { good: 0, warn: 12, bad: 30 };
  const penalty = findings.reduce((sum, f) => sum + WEIGHT[f.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return { score, findings, titlePreview, titleLength, metaPreview, metaLength };
}
