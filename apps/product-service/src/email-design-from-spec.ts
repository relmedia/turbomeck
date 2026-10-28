/**
 * Turns a small block spec into an Unlayer design.
 *
 * ## Why a spec and not design JSON
 *
 * This exists so a language model never writes Unlayer design JSON. That
 * schema has dozens of fields per block, and getting one wrong does not throw
 * — the design opens BLANK in the editor. It is the worst failure shape
 * available: invisible to any check that only parses the JSON, and the admin
 * concludes the feature is broken.
 *
 * So the model emits six block kinds with a handful of fields each, this
 * file validates them, and the already-verified builders in
 * `email-design-builder.ts` produce the actual design. A malformed spec is
 * rejected with a reason; it cannot become a broken template.
 *
 * ## What is validated, and why each one
 *
 * Every field here reaches a customer's inbox, and the admin writing the
 * prompt is not the only input — the model's output is untrusted text.
 *
 *  - **HTML** goes through the inline-only email allowlist. Email copy is
 *    interpolated raw by design (the templates rely on entities), so without
 *    this a `<script>` or an `onerror=` would pass straight through.
 *  - **Colours** must match a strict hex pattern. They are injected into a
 *    `style` attribute, where `red; } body { display:none` is CSS injection
 *    into every copy of the mail.
 *  - **Links** must be a known merge token, an https URL, or mailto. A
 *    `javascript:` href in a button is the obvious hole.
 *  - **Tokens** must exist in the catalogue. An invented `{{order_totals_2}}`
 *    would ship as literal braces to a customer.
 *  - **The logo** is resolved by this server, not supplied by the model, so
 *    a generated template cannot point an email at an outside host.
 */

import {
  buttonBlock,
  design,
  dividerBlock,
  imageBlock,
  resetIdSequence,
  textBlock,
  INK,
  MUTED,
  type Block,
} from "./email-design-builder.js";
import { getOrderEmailLogoUrl } from "./email-logo.js";
import { MERGE_TAGS, BLOCK_TOKENS } from "./email-merge-tags.js";
import { sanitizeEmailCopy } from "@repo/sanitize-html";

export type SpecBlock =
  | { type: "heading"; text: string; icon?: string }
  | { type: "text"; html: string }
  | { type: "button"; label: string; href: string; color?: string }
  | { type: "divider" }
  | { type: "token"; token: string }
  | { type: "logo" };

export type DesignSpec = {
  subject: string;
  blocks: SpecBlock[];
};

export type BuildResult = {
  design: Record<string, unknown>;
  subject: string;
  /** Non-fatal problems, shown to the admin so a thin design is visible. */
  warnings: string[];
};

/** Caps that stop one generation becoming a 200 KB email. */
const MAX_BLOCKS = 24;
const MAX_TEXT = 2000;
const MAX_LABEL = 80;
const MAX_SUBJECT = 200;

const HEX = /^#[0-9a-f]{6}$/i;
const KNOWN_TOKENS = new Set(MERGE_TAGS.map((t) => t.token));
const TOKEN_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export class SpecError extends Error {}

function asString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new SpecError(`${field} måste vara text`);
  const trimmed = value.trim();
  if (!trimmed) throw new SpecError(`${field} får inte vara tomt`);
  return trimmed.slice(0, max);
}

/**
 * A link is safe if it is a merge token, an https URL or a mailto. Everything
 * else — `javascript:`, `data:`, a bare path that would resolve against the
 * mail client — is refused rather than silently dropped, so a generation that
 * wanted a link does not quietly produce a dead button.
 */
function safeHref(raw: string): string {
  const href = raw.trim();
  const token = href.match(/^\{\{\s*([a-z0-9_]+)\s*\}\}$/i);
  if (token) {
    const name = token[1]!.toLowerCase();
    if (!KNOWN_TOKENS.has(name)) throw new SpecError(`okänd tagg i länk: {{${name}}}`);
    return `{{${name}}}`;
  }
  if (/^https:\/\/[^\s"']+$/i.test(href)) return href;
  if (/^mailto:[^\s"']+@[^\s"']+$/i.test(href)) return href;
  throw new SpecError(`otillåten länk: ${href.slice(0, 60)}`);
}

function safeColor(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = String(raw).trim();
  if (!HEX.test(value)) throw new SpecError(`ogiltig färg: ${value.slice(0, 20)}`);
  return value;
}

/** A single emoji (or short glyph); anything longer is a label, not an icon. */
function safeIcon(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  return [...value].slice(0, 2).join("");
}

/** Collect tokens used in copy so unknown ones can be reported, not shipped. */
function collectUnknownTokens(html: string, into: Set<string>): void {
  for (const m of html.matchAll(TOKEN_PATTERN)) {
    const name = m[1]?.toLowerCase();
    if (name && !KNOWN_TOKENS.has(name)) into.add(name);
  }
}

export function buildDesignFromSpec(raw: unknown): BuildResult {
  if (!raw || typeof raw !== "object") throw new SpecError("Tomt svar från AI");
  const spec = raw as Partial<DesignSpec>;

  const subject = asString(spec.subject, "Ämnesrad", MAX_SUBJECT);
  if (!Array.isArray(spec.blocks) || spec.blocks.length === 0) {
    throw new SpecError("AI returnerade inga block");
  }
  if (spec.blocks.length > MAX_BLOCKS) {
    throw new SpecError(`För många block (max ${MAX_BLOCKS})`);
  }

  resetIdSequence();
  const warnings: string[] = [];
  const unknown = new Set<string>();
  const blocks: Block[] = [];
  const usedBlockTokens = new Set<string>();

  for (const [i, item] of spec.blocks.entries()) {
    if (!item || typeof item !== "object") throw new SpecError(`Block ${i + 1} är ogiltigt`);
    const where = `Block ${i + 1}`;

    switch (item.type) {
      case "heading": {
        const text = asString(item.text, `${where} rubrik`, MAX_LABEL * 3);
        collectUnknownTokens(text, unknown);
        const icon = safeIcon(item.icon);
        /**
         * Built as markup rather than passed to the sanitiser: the text is
         * escaped here, so there is nothing for an allowlist to strip and
         * nothing an injection could ride in on.
         */
        blocks.push(
          textBlock(
            (icon
              ? `<p style="line-height: 150%;" align="center"><span style="font-size: 34px;">${escapeText(icon)}</span></p>`
              : "") +
              `<p style="line-height: 140%;" align="center"><strong style="font-size: 23px;">${escapeText(text)}</strong></p>`,
            { align: "center", padding: "16px 24px 4px" },
          ),
        );
        break;
      }

      case "text": {
        const dirty = asString(item.html, `${where} text`, MAX_TEXT);
        collectUnknownTokens(dirty, unknown);
        /**
         * The inline-only email allowlist: `strong em b i a br span` plus
         * entities. It permits no block elements, so a generated paragraph
         * cannot restructure the design, and no `style`, so it cannot repaint
         * it either.
         */
        const clean = sanitizeEmailCopy(dirty).trim();
        if (!clean) {
          warnings.push(`${where}: texten togs bort av säkerhetsfiltret`);
          break;
        }
        blocks.push(textBlock(`<p style="line-height: 150%;">${clean}</p>`));
        break;
      }

      case "button": {
        const label = asString(item.label, `${where} knapptext`, MAX_LABEL);
        const href = safeHref(asString(item.href, `${where} länk`, 500));
        blocks.push(buttonBlock(escapeText(label), href, safeColor(item.color, "#111827")));
        break;
      }

      case "divider":
        blocks.push(dividerBlock());
        break;

      case "logo": {
        /**
         * Resolved here, not chosen by the model: the shop's logo is a fact
         * this server knows and a generated template should not be guessing
         * at a URL for it.
         */
        const logo = getOrderEmailLogoUrl();
        if (!logo) {
          warnings.push("Ingen logotyp är konfigurerad (EMAIL_LOGO_URL), blocket hoppades över");
          break;
        }
        blocks.push(
          imageBlock(logo, "Turbomeck", { width: 180, padding: "24px 24px 8px" }),
        );
        break;
      }

      case "token": {
        const token = asString(item.token, `${where} tagg`, 60).toLowerCase().replace(/[{}\s]/g, "");
        if (!BLOCK_TOKENS.has(token)) {
          throw new SpecError(
            `${where}: {{${token}}} är inte ett block — giltiga är ${[...BLOCK_TOKENS].join(", ")}`,
          );
        }
        if (usedBlockTokens.has(token)) {
          warnings.push(`${where}: {{${token}}} användes flera gånger, den extra togs bort`);
          break;
        }
        usedBlockTokens.add(token);
        /**
         * Alone in its own text block, which is exactly what the substitution
         * looks for when it unwraps the paragraph. A block token sharing a
         * paragraph with copy puts a table inside a `<p>`, and Outlook then
         * drops it outside its cell at full page width.
         */
        blocks.push(textBlock(`<p>{{${token}}}</p>`, { padding: "4px 24px" }));
        break;
      }

      default:
        throw new SpecError(`${where}: okänd blocktyp "${String((item as { type?: unknown }).type)}"`);
    }
  }

  if (blocks.length === 0) throw new SpecError("Inget innehåll blev kvar efter validering");

  if (unknown.size > 0) {
    warnings.push(
      `Okända taggar som skickas som text: ${[...unknown].map((t) => `{{${t}}}`).join(", ")}`,
    );
  }

  return { design: design(blocks), subject, warnings };
}

/** Escapes text that is placed into markup built here, not by the sanitiser. */
function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The catalogue the model is told about, as compact prompt text. */
export function mergeTagBriefing(): string {
  const scalars = MERGE_TAGS.filter((t) => t.kind === "scalar");
  const blocks = MERGE_TAGS.filter((t) => t.kind === "block");
  return [
    "Scalar tokens (use inside text, written as {{token}}):",
    ...scalars.map((t) => `  {{${t.token}}} — ${t.label} (t.ex. "${t.sample}")`),
    "",
    'Block tokens (use ONLY as a {"type":"token"} block, never inside text):',
    ...blocks.map((t) => `  ${t.token} — ${t.label}`),
  ].join("\n");
}

/** Colours the palette already uses, offered so generations stay on-brand. */
export const PALETTE_HINT = `Brand colours: ink ${INK}, muted ${MUTED}, green #16a34a, amber #d97706, red #dc2626, blue #2563eb.`;
