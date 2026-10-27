/**
 * Merge tags for designed emails, and the substitution that fills them in.
 *
 * The builder produces static HTML. For a "tack för ditt köp" mail that is not
 * enough — it has to carry the customer's name, their order number, the lines
 * they actually bought, and the totals. These tokens are what the designer
 * drops into a design, and what this file replaces at send time.
 *
 * ## Two kinds of token, and the difference matters
 *
 * **Scalar** (`{{order_number}}`, `{{customer_first_name}}`) — one value from
 * the order. Always HTML-ESCAPED on substitution. A product name containing
 * `<` must never become markup, whatever the design around it says.
 *
 * **Block** (`{{order_items}}`, `{{order_totals}}`, `{{next_steps}}`) — a
 * whole section rendered on the server and injected as trusted HTML. These
 * exist because a drag-and-drop design cannot express "repeat this row once
 * per product": the editor has no loop. The server renders the rows, the
 * design decides where they sit.
 *
 * This is the single source of truth for the catalogue. Admin fetches it over
 * HTTP rather than keeping a second copy — a mirrored list is exactly how the
 * PostNord config and its status checker drifted apart.
 */

import { escapeHtml } from "./email-escape.js";

export type MergeTagKind = "scalar" | "block";

export type MergeTagDef = {
  /** The token as written in a design, without braces. */
  token: string;
  /** Swedish label shown in the editor's merge-tag menu. */
  label: string;
  /** Which group it appears under. */
  group: string;
  kind: MergeTagKind;
  /** Shown in the editor so a design reads sensibly while being built. */
  sample: string;
};

export const MERGE_TAGS: MergeTagDef[] = [
  // ---- customer ----------------------------------------------------------
  { token: "customer_first_name", label: "Förnamn", group: "Kund", kind: "scalar", sample: "Johan" },
  { token: "customer_last_name", label: "Efternamn", group: "Kund", kind: "scalar", sample: "Berg" },
  { token: "customer_email", label: "E-post", group: "Kund", kind: "scalar", sample: "kund@example.se" },

  // ---- order -------------------------------------------------------------
  { token: "order_number", label: "Ordernummer", group: "Order", kind: "scalar", sample: "ORD-912" },
  { token: "order_date", label: "Orderdatum", group: "Order", kind: "scalar", sample: "2026-10-27" },
  { token: "order_subtotal", label: "Delsumma", group: "Order", kind: "scalar", sample: "16 990 kr" },
  { token: "order_shipping", label: "Frakt", group: "Order", kind: "scalar", sample: "245 kr" },
  { token: "order_discount", label: "Rabatt", group: "Order", kind: "scalar", sample: "-500 kr" },
  { token: "order_vat", label: "Varav moms", group: "Order", kind: "scalar", sample: "3 347 kr" },
  { token: "order_total", label: "Totalt", group: "Order", kind: "scalar", sample: "16 735 kr" },
  { token: "payment_method", label: "Betalningsmetod", group: "Order", kind: "scalar", sample: "Visa •••• 4242" },

  // ---- delivery ----------------------------------------------------------
  { token: "delivery_address", label: "Leveransadress", group: "Leverans", kind: "scalar", sample: "Testgatan 12, 41117 Göteborg" },
  { token: "service_point", label: "Utlämningsställe", group: "Leverans", kind: "scalar", sample: "ICA Supermarket Backaplan" },
  { token: "tracking_number", label: "Spårningsnummer", group: "Leverans", kind: "scalar", sample: "00573132902028050319" },
  { token: "tracking_url", label: "Spårningslänk", group: "Leverans", kind: "scalar", sample: "https://postnord.se/..." },
  {
    token: "service_point_address",
    label: "Utlämningsställets adress",
    group: "Leverans",
    kind: "scalar",
    sample: "Backaplan 2, 41705 Göteborg",
  },
  {
    token: "core_return_deadline",
    label: "Sista dag för kärnretur",
    group: "Leverans",
    kind: "scalar",
    sample: "2026-11-10",
  },

  // ---- blocks ------------------------------------------------------------
  {
    token: "order_items",
    label: "Beställda produkter (tabell)",
    group: "Block",
    kind: "block",
    sample: "En rad per produkt med namn, antal och pris.",
  },
  {
    token: "order_totals",
    label: "Summering (delsumma, frakt, moms, totalt)",
    group: "Block",
    kind: "block",
    sample: "Delsumma, frakt, rabatt, moms och totalsumma.",
  },
  {
    token: "next_steps",
    label: "Vad händer nu? (tre steg)",
    group: "Block",
    kind: "block",
    sample: "Bekräftelse, packning och leverans.",
  },
];

/** Shape Unlayer's `options.mergeTags` expects: nested groups of tags. */
export function mergeTagsForEditor(): Record<
  string,
  { name: string; mergeTags: Record<string, { name: string; value: string; sample: string }> }
> {
  const groups: ReturnType<typeof mergeTagsForEditor> = {};
  for (const t of MERGE_TAGS) {
    const key = t.group.toLowerCase().replace(/[^a-z]/g, "_");
    groups[key] ??= { name: t.group, mergeTags: {} };
    groups[key]!.mergeTags[t.token] = {
      name: t.kind === "block" ? `${t.label} — egen textruta` : t.label,
      value: `{{${t.token}}}`,
      sample: t.sample,
    };
  }
  return groups;
}

export type MergeValues = {
  scalars: Record<string, string>;
  /** Pre-rendered HTML, injected as-is. Server-produced only. */
  blocks: Record<string, string>;
};

/** The tokens that expand to a whole `<table>` rather than to a value. */
export const BLOCK_TOKENS: ReadonlySet<string> = new Set(
  MERGE_TAGS.filter((t) => t.kind === "block").map((t) => t.token),
);

/**
 * A block token is typed into a text element, and the editor wraps whatever is
 * in a text element in `<p>`. A `<table>` inside a `<p>` is invalid HTML: the
 * browser preview survives it, but Outlook closes the paragraph early and the
 * table lands outside the design's cell at full page width.
 *
 * So when a paragraph contains nothing but one block token — whitespace, a
 * `&nbsp;`, and a stray `<br>` from pressing Enter all count as nothing — the
 * paragraph itself is replaced, not its contents. A block token sharing a
 * paragraph with real text is left to the generic pass below; that is the
 * admin putting it somewhere it does not belong, and a visibly wrong layout is
 * a better outcome than silently moving their text.
 */
function unwrapBlockParagraphs(html: string): string {
  return html.replace(
    /<p(?=[\s>])[^>]*>((?:\s|&nbsp;|<br\s*\/?>)*)\{\{\s*([a-z0-9_]+)\s*\}\}((?:\s|&nbsp;|<br\s*\/?>)*)<\/p>/gi,
    (whole, _before: string, rawToken: string, _after: string) =>
      BLOCK_TOKENS.has(rawToken.toLowerCase()) ? `{{${rawToken.toLowerCase()}}}` : whole,
  );
}

/**
 * Replace every token in a designed email.
 *
 * Scalars are escaped; blocks are not, because the server built them. An
 * unknown token is left alone rather than blanked — a visible `{{typo}}` in a
 * test send is a bug someone fixes, where a silent empty space is one that
 * ships.
 */
export function applyMergeTags(html: string, values: MergeValues): string {
  return unwrapBlockParagraphs(html).replace(
    /\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
    (whole, rawToken: string) => {
      const token = rawToken.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(values.blocks, token)) {
        return values.blocks[token] ?? "";
      }
      if (Object.prototype.hasOwnProperty.call(values.scalars, token)) {
        return escapeHtml(values.scalars[token] ?? "");
      }
      return whole;
    },
  );
}

/**
 * Substitution for a subject line.
 *
 * A subject is a mail header, not HTML: `&amp;` would be delivered literally,
 * so values go in unescaped. Block tokens are dropped — a table in a subject
 * line is meaningless — rather than injected, which would put raw markup in
 * the inbox list.
 */
export function applyMergeTagsPlain(text: string, values: MergeValues): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (whole, rawToken: string) => {
    const token = rawToken.toLowerCase();
    if (BLOCK_TOKENS.has(token)) return "";
    if (Object.prototype.hasOwnProperty.call(values.scalars, token)) {
      return values.scalars[token] ?? "";
    }
    return whole;
  });
}

/** Tokens a design uses that nothing will fill — surfaced in the editor. */
export function unknownTokens(html: string): string[] {
  const known = new Set(MERGE_TAGS.map((t) => t.token));
  const found = new Set<string>();
  for (const m of html.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    const t = m[1]?.toLowerCase();
    if (t && !known.has(t)) found.add(t);
  }
  return [...found];
}


/* ------------------------------------------------------------------ *
 * Block renderers
 *
 * Table-based with inline CSS, because that is the only thing email clients
 * agree on. Each one is a self-contained <table> so it drops into whatever
 * cell the design puts the token in without inheriting a broken width.
 * ------------------------------------------------------------------ */

const MUTED = "#6b7280";
const INK = "#111827";
const RULE = "#e5e7eb";

export type MergeLine = {
  productName: string;
  variant?: string | null;
  quantity: number;
  /** Already formatted with its currency, e.g. "7 495 kr". */
  lineTotal: string;
};

/** One row per product. The editor has no loop, so this is rendered here. */
export function renderItemsBlock(lines: MergeLine[], labels: { quantity: string }): string {
  if (lines.length === 0) return "";
  const rows = lines
    .map(
      (l) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${RULE};vertical-align:top;">
          <p style="margin:0;font-weight:600;color:${INK};font-size:15px;">${escapeHtml(l.productName)}</p>
          ${l.variant ? `<p style="margin:2px 0 0 0;font-size:13px;color:${MUTED};">${escapeHtml(l.variant)}</p>` : ""}
          <p style="margin:2px 0 0 0;font-size:13px;color:${MUTED};">${escapeHtml(labels.quantity)}: ${l.quantity}</p>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid ${RULE};text-align:right;vertical-align:top;white-space:nowrap;">
          <p style="margin:0;font-weight:600;color:${INK};font-size:15px;">${escapeHtml(l.lineTotal)}</p>
        </td>
      </tr>`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">${rows}</table>`;
}

export type MergeTotalRow = { label: string; value: string; strong?: boolean; accent?: boolean };

/** Delsumma / frakt / rabatt / moms / totalt. Rows with no value are dropped. */
export function renderTotalsBlock(rows: MergeTotalRow[]): string {
  const body = rows
    .filter((r) => r.value)
    .map(
      (r) => `
      <tr>
        <td style="padding:4px 0;color:${r.strong ? INK : MUTED};font-size:${r.strong ? "18px" : "14px"};font-weight:${r.strong ? "700" : "400"};">${escapeHtml(r.label)}</td>
        <td style="padding:4px 0;text-align:right;color:${r.accent ? "#16a34a" : r.strong ? INK : MUTED};font-size:${r.strong ? "18px" : "14px"};font-weight:${r.strong ? "700" : "400"};white-space:nowrap;">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">${body}</table>`;
}

export type MergeStep = { title: string; body: string };

/** The numbered "Vad händer nu?" list. */
export function renderStepsBlock(steps: MergeStep[]): string {
  const body = steps
    .map(
      (st, i) => `
      <tr>
        <td width="28" style="width:28px;padding:6px 10px 6px 0;vertical-align:top;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-radius:9999px;background-color:#f3f4f6;">
            <tr><td width="24" height="24" style="width:24px;height:24px;text-align:center;vertical-align:middle;line-height:24px;font-size:12px;color:${INK};">${i + 1}</td></tr>
          </table>
        </td>
        <td style="padding:6px 0;vertical-align:top;">
          <p style="margin:0;font-weight:600;color:${INK};font-size:14px;">${escapeHtml(st.title)}</p>
          <p style="margin:2px 0 0 0;color:${MUTED};font-size:13px;line-height:1.5;">${escapeHtml(st.body)}</p>
        </td>
      </tr>`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">${body}</table>`;
}
