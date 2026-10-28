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

export type MergeStep = {
  title: string;
  body: string;
  /** An emoji shown in the badge. Falls back to the step's position. */
  icon?: string;
  /** Eyebrow above the title, e.g. "Steg 1". Omitted if absent. */
  label?: string;
};

/**
 * The "Vad händer nu?" steps, side by side.
 *
 * ## Why this markup and not three table cells
 *
 * Three fixed `<td>` columns are horizontal on a desktop and unreadable on a
 * phone: each becomes ~100px of wrapped text. A media query would fix that
 * but cannot be relied on — it is stripped by some clients, and this block is
 * injected into a built design where there is no `<head>` to put one in.
 *
 * So this is the fluid-hybrid pattern: `display:inline-block` with a
 * `max-width` lets the three sit in a row when there is room and stack when
 * there is not, with no media query at all. Outlook ignores inline-block, so
 * it gets a real table through the `[if mso]` comments — invisible to every
 * other client.
 *
 * Two details that look like noise and are not:
 *  - `font-size:0` on the parent cell kills the whitespace between the
 *    inline-blocks, which would otherwise add ~4px each and break the fit.
 *    Each column restores its own size.
 *  - `mso-line-height-rule:exactly` with explicit width/height keeps the
 *    badge a circle in Outlook, which otherwise renders an oval.
 *
 * Widths: 164px plus 8px of padding is 172 per column, 516 for three. Sized
 * against the USABLE width, not the body width: the cell this sits in has
 * 24px of padding a side, so a 600px email offers 552px — a first attempt at
 * 192 per column totalled 576 and wrapped the third step onto its own line.
 * 516 leaves room for a design with slightly more padding than ours.
 *
 * On a phone two columns no longer fit, so they stack one per row.
 */
export function renderStepsBlock(steps: MergeStep[]): string {
  if (steps.length === 0) return "";

  const columns = steps
    .map((st, i) => {
      const badge = st.icon ? escapeHtml(st.icon) : String(i + 1);
      const eyebrow = st.label
        ? `<p style="margin:10px 0 0 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(st.label)}</p>`
        : "";
      return `
          <div class="tm-step" style="display:inline-block;width:100%;max-width:164px;vertical-align:top;text-align:center;padding:0 4px 14px 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-radius:9999px;background-color:#eef2f7;">
              <tr><td width="46" height="46" style="width:46px;height:46px;border-radius:9999px;background-color:#eef2f7;text-align:center;vertical-align:middle;line-height:46px;mso-line-height-rule:exactly;font-size:22px;color:${INK};">${badge}</td></tr>
            </table>
            ${eyebrow}
            <p style="margin:3px 0 0 0;font-size:14px;font-weight:600;color:${INK};line-height:1.35;">${escapeHtml(st.title)}</p>
            <p style="margin:5px 0 0 0;font-size:13px;color:${MUTED};line-height:1.5;">${escapeHtml(st.body)}</p>
          </div>`;
    })
    .join(
      `
          <!--[if mso]></td><td width="33.33%" valign="top" align="center"><![endif]-->`,
    );

  /**
   * Inline-block alone gives 3-up at 600px and a clean 1-up stack at 320px,
   * but 2+1 in between — two columns still fit at 375-414px and the third
   * drops to its own line. There is no column width that avoids that
   * without a media query: three must total under ~550px, and two of those
   * fit inside a phone.
   *
   * So one rule forces a full-width stack below 480px. It lives in a `style`
   * tag inside the block rather than the document head, because the same
   * renderer feeds a built design where there is no head to reach. Clients
   * that drop `style` in the body simply get the 2+1 fallback, which is
   * untidy and not broken — nothing depends on this rule landing.
   */
  return `<style>@media only screen and (max-width:479px){.tm-step{max-width:100%!important;width:100%!important;display:block!important}}</style>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
  <tr>
    <td align="center" style="font-size:0;line-height:0;padding:0;">
      <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td width="33.33%" valign="top" align="center"><![endif]-->${columns}
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>`;
}

