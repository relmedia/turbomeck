/**
 * Checks the substitution rules the designed emails depend on.
 *
 * The one that matters most is the escaping split: a scalar carries a value
 * from an order (a product name, a customer's name) and must never become
 * markup, while a block is HTML this server just built and must not be
 * escaped or it renders as visible tag soup. Getting that backwards is either
 * an injection or a broken email, so it is asserted directly.
 *
 * Pure — touches no database, no SMTP.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-merge-tags.ts
 */

import {
  MERGE_TAGS,
  BLOCK_TOKENS,
  applyMergeTags,
  mergeTagsForEditor,
  unknownTokens,
  renderItemsBlock,
  renderTotalsBlock,
  renderStepsBlock,
} from "./email-merge-tags.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
};

const XSS = '<img src=x onerror=alert(1)>';

// ---- escaping ------------------------------------------------------------
{
  const out = applyMergeTags("<p>Hej {{customer_first_name}}!</p>", {
    scalars: { customer_first_name: XSS },
    blocks: {},
  });
  check("a scalar value is escaped", !out.includes("<img") && out.includes("&lt;img"), out);
}

{
  const block = '<table><tr><td>rad</td></tr></table>';
  const out = applyMergeTags("<div>{{order_items}}</div>", { scalars: {}, blocks: { order_items: block } });
  check("a block is injected raw", out.includes(block), out);
}

// ---- unknown tokens stay visible ----------------------------------------
{
  const out = applyMergeTags("<p>{{order_totl}}</p>", { scalars: { order_total: "1 kr" }, blocks: {} });
  check("an unknown token is left visible, not blanked", out.includes("{{order_totl}}"), out);
  check("unknownTokens reports it", unknownTokens("<p>{{order_totl}} {{order_total}}</p>").join(",") === "order_totl");
}

// ---- whitespace and case tolerance --------------------------------------
{
  const out = applyMergeTags("{{ Order_Number }}", { scalars: { order_number: "ORD-1" }, blocks: {} });
  check("tokens tolerate spaces and casing", out === "ORD-1", out);
}

// ---- the paragraph unwrap -----------------------------------------------
{
  const block = '<table id="b"><tr><td>x</td></tr></table>';
  const v = { scalars: {}, blocks: { order_items: block } };

  const plain = applyMergeTags('<p style="line-height:140%">{{order_items}}</p>', v);
  check("a block alone in a <p> replaces the whole paragraph", !plain.includes("<p"), plain);

  const padded = applyMergeTags("<p>&nbsp;{{order_items}}<br /></p>", v);
  check("whitespace, &nbsp; and <br> still count as alone", !padded.includes("<p"), padded);

  const shared = applyMergeTags("<p>Du köpte: {{order_items}}</p>", v);
  check("a block sharing a paragraph keeps the paragraph", shared.includes("<p>Du köpte:"), shared);

  const scalarP = applyMergeTags("<p>{{order_number}}</p>", { scalars: { order_number: "ORD-1" }, blocks: {} });
  check("a SCALAR alone in a <p> keeps its paragraph", scalarP === "<p>ORD-1</p>", scalarP);
}

// ---- the editor catalogue -----------------------------------------------
{
  const groups = mergeTagsForEditor();
  const flat = Object.values(groups).flatMap((g) => Object.keys(g.mergeTags));
  check(
    "every catalogued tag reaches the editor",
    flat.length === MERGE_TAGS.length && MERGE_TAGS.every((t) => flat.includes(t.token)),
    { editor: flat.length, catalogue: MERGE_TAGS.length },
  );
  check(
    "every editor value is a well-formed token",
    Object.values(groups).every((g) =>
      Object.entries(g.mergeTags).every(([k, t]) => t.value === `{{${k}}}`),
    ),
  );
  check(
    "BLOCK_TOKENS matches the catalogue",
    [...BLOCK_TOKENS].sort().join(",") ===
      MERGE_TAGS.filter((t) => t.kind === "block").map((t) => t.token).sort().join(","),
    [...BLOCK_TOKENS],
  );
  /** A group key is used as an object key in Unlayer's nested shape. */
  check("group keys are non-empty and unique", Object.keys(groups).every(Boolean) && new Set(Object.keys(groups)).size === Object.keys(groups).length, Object.keys(groups));
}

// ---- block renderers escape their own inputs ----------------------------
{
  const html = renderItemsBlock(
    [{ productName: XSS, variant: XSS, quantity: 2, lineTotal: "7 495 kr" }],
    { quantity: "Antal" },
  );
  check("renderItemsBlock escapes the product name", !html.includes("<img") && html.includes("&lt;img"), html.slice(0, 120));
  check("renderItemsBlock shows the quantity", html.includes("Antal: 2"));
  check("an empty order renders nothing", renderItemsBlock([], { quantity: "Antal" }) === "");

  const totals = renderTotalsBlock([
    { label: "Delsumma", value: "16 990 kr" },
    { label: "Rabatt", value: "" },
    { label: "Totalt", value: "16 735 kr", strong: true },
  ]);
  check("renderTotalsBlock drops valueless rows", !totals.includes("Rabatt"), totals.slice(0, 80));
  check("renderTotalsBlock keeps the rest", totals.includes("Delsumma") && totals.includes("Totalt"));

  const steps = renderStepsBlock([
    { title: "Bekräftat", body: "Vi har tagit emot din order." },
    { title: "Packas", body: "Din order packas." },
  ]);
  check("renderStepsBlock numbers the steps", steps.includes(">1<") && steps.includes(">2<"), undefined);
}

/**
 * The whole point of blocks is that a designed email can carry real order
 * lines, so the end-to-end shape is worth one assertion: a design with the
 * token in a paragraph, filled with a rendered table, must come out as valid
 * markup with the product in it and nothing executable.
 */
{
  const design = '<td><p>Hej {{customer_first_name}},</p><p>{{order_items}}</p><p>{{order_total}}</p></td>';
  const out = applyMergeTags(design, {
    scalars: { customer_first_name: "Johan", order_total: "16 735 kr" },
    blocks: {
      order_items: renderItemsBlock(
        [{ productName: 'Turbo "GT" 2.0', variant: null, quantity: 1, lineTotal: "16 490 kr" }],
        { quantity: "Antal" },
      ),
    },
  });
  check("end to end: the name is there", out.includes("Hej Johan,"));
  check("end to end: the product is there, quoted safely", out.includes("Turbo &quot;GT&quot; 2.0"), undefined);
  check("end to end: no table inside a paragraph", !/<p[^>]*>\s*<table/i.test(out));
  check("end to end: no tokens left", !out.includes("{{"), out.match(/\{\{[^}]*\}\}/g) ?? undefined);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
