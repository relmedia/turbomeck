/**
 * Checks the validation between a generated spec and a stored design.
 *
 * This is the security boundary of the AI feature. The spec is written by a
 * language model from a prompt an admin typed, and whatever survives here is
 * mailed to customers — so each assertion below is a specific thing that must
 * not reach an inbox, not a general "it works" check.
 *
 * The other half is the blank-template failure: a design with a subtly wrong
 * shape does not error, it opens empty in the editor. That is why generation
 * goes through the verified builders rather than letting the model write
 * design JSON, and why the shape is asserted here too.
 *
 * Pure — no database, no network, no SMTP.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     apps/product-service/src/__verify-design-from-spec.ts
 */

import { buildDesignFromSpec, SpecError, mergeTagBriefing } from "./email-design-from-spec.js";
import { MERGE_TAGS, BLOCK_TOKENS, applyMergeTags } from "./email-merge-tags.js";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/** Runs a spec and reports whether it was rejected, and with what message. */
function attempt(spec: unknown): { ok: boolean; message?: string; result?: ReturnType<typeof buildDesignFromSpec> } {
  try {
    return { ok: true, result: buildDesignFromSpec(spec) };
  } catch (err) {
    return { ok: false, message: err instanceof SpecError ? err.message : String(err) };
  }
}

/** Every string in a built design, for "did this survive" questions. */
function allText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(allText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(allText).join(" ");
  return "";
}

const GOOD = {
  subject: "Tack för ditt köp, {{customer_first_name}}!",
  blocks: [
    { type: "heading", text: "Tack för din order!", icon: "🎉" },
    { type: "text", html: "Hej <strong>{{customer_first_name}}</strong>, vi har tagit emot order {{order_number}}." },
    { type: "token", token: "order_items" },
    { type: "token", token: "order_totals" },
    { type: "button", label: "Spåra paketet", href: "{{tracking_url}}", color: "#16a34a" },
    { type: "divider" },
    { type: "text", html: "Hör av dig om du undrar något." },
  ],
};

/* ---- the happy path produces a loadable design ------------------------ */
{
  const r = attempt(GOOD);
  check("a well-formed spec builds", r.ok, r.message);
  if (r.result) {
    const d = r.result.design as { body: { rows: unknown[] }; schemaVersion: number };
    check("it has one row per block", d.body.rows.length === GOOD.blocks.length, d.body.rows.length);
    check("it carries a schema version", typeof d.schemaVersion === "number", d.schemaVersion);
    check("the subject survives", r.result.subject.includes("{{customer_first_name}}"));
    check("no warnings for clean input", r.result.warnings.length === 0, r.result.warnings);

    /**
     * Row shape is what decides blank-or-not in the editor. Assert the bits
     * the editor actually reads rather than trusting the builder.
     */
    const rows = d.body.rows as Array<{ cells: number[]; columns: Array<{ contents: unknown[] }> }>;
    check(
      "every row has one cell and one content block",
      rows.every((row) => row.cells?.length === 1 && row.columns?.[0]?.contents?.length === 1),
    );
    const ids = rows.map((r2) => (r2 as unknown as { id: string }).id);
    check("row ids are unique", new Set(ids).size === ids.length);

    /** The design must actually render the customer's data. */
    const text = allText(r.result.design);
    check("the copy reached the design", text.includes("Tack för din order!"));
    check("the block token is alone in a paragraph", text.includes("<p>{{order_items}}</p>"));
  }
}

/* ---- script injection ------------------------------------------------- */
{
  const r = attempt({
    subject: "x",
    blocks: [{ type: "text", html: 'Hej <script>alert(1)</script><img src=x onerror="alert(2)">' }],
  });
  const text = r.result ? allText(r.result.design) : "";
  check("a <script> never reaches the design", !text.includes("<script"), text.slice(0, 120));
  check("an onerror attribute never reaches the design", !text.toLowerCase().includes("onerror"));
}

/* ---- CSS injection through a colour ----------------------------------- */
{
  for (const bad of ["red; } body { display:none", "#16a34a; background:url(x)", "rgb(1,2,3)", "#fff"]) {
    const r = attempt({
      subject: "x",
      blocks: [{ type: "button", label: "Klicka", href: "https://turbomeck.se", color: bad }],
    });
    check(`a non-hex colour is refused: ${bad.slice(0, 24)}`, !r.ok, r.message);
  }
  const good = attempt({
    subject: "x",
    blocks: [{ type: "button", label: "Klicka", href: "https://turbomeck.se", color: "#16A34A" }],
  });
  check("a real six-digit hex colour is accepted", good.ok, good.message);
}

/* ---- dangerous links -------------------------------------------------- */
{
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "http://turbomeck.se",
    "/relative/path",
    "{{not_a_real_token}}",
  ]) {
    const r = attempt({ subject: "x", blocks: [{ type: "button", label: "Gå", href: bad }] });
    check(`a dangerous link is refused: ${bad.slice(0, 28)}`, !r.ok, r.message);
  }
  for (const ok of ["https://turbomeck.se/spara", "mailto:info@turbomeck.se", "{{tracking_url}}"]) {
    const r = attempt({ subject: "x", blocks: [{ type: "button", label: "Gå", href: ok }] });
    check(`a safe link is accepted: ${ok}`, r.ok, r.message);
  }
}

/* ---- tokens ----------------------------------------------------------- */
{
  const r = attempt({ subject: "x", blocks: [{ type: "token", token: "customer_first_name" }] });
  check("a SCALAR token is refused as a block", !r.ok, r.message);

  const invented = attempt({ subject: "x", blocks: [{ type: "token", token: "order_totals_2" }] });
  check("an invented block token is refused", !invented.ok, invented.message);

  for (const token of BLOCK_TOKENS) {
    const good = attempt({ subject: "x", blocks: [{ type: "token", token }] });
    check(`the real block token ${token} is accepted`, good.ok, good.message);
  }

  /** An unknown token inside copy is reported, not silently shipped. */
  const warned = attempt({
    subject: "x",
    blocks: [{ type: "text", html: "Order {{order_nummer}} är klar" }],
  });
  check("an unknown token in copy produces a warning", Boolean(warned.result?.warnings.length), warned.result?.warnings);

  const dupe = attempt({
    subject: "x",
    blocks: [
      { type: "token", token: "order_items" },
      { type: "token", token: "order_items" },
    ],
  });
  check("a repeated block token is dropped with a warning", Boolean(dupe.result?.warnings.length), dupe.result?.warnings);
}

/* ---- malformed input -------------------------------------------------- */
{
  for (const [label, spec] of [
    ["null", null],
    ["no subject", { blocks: [{ type: "divider" }] }],
    ["no blocks", { subject: "x" }],
    ["empty blocks", { subject: "x", blocks: [] }],
    ["unknown block type", { subject: "x", blocks: [{ type: "carousel" }] }],
    ["too many blocks", { subject: "x", blocks: Array.from({ length: 40 }, () => ({ type: "divider" })) }],
    ["block is a string", { subject: "x", blocks: ["divider"] }],
  ] as const) {
    const r = attempt(spec);
    check(`malformed spec is refused: ${label}`, !r.ok, r.message);
  }
}

/* ---- the design still works with the substitution --------------------- */
{
  const r = attempt(GOOD);
  const text = allText(r.result!.design);
  const filled = applyMergeTags(text, {
    scalars: { customer_first_name: "Anna", order_number: "TM-1", tracking_url: "https://x.se/1" },
    blocks: { order_items: "<table><tr><td>rad</td></tr></table>", order_totals: "<table></table>" },
  });
  check("tokens in a generated design substitute", filled.includes("Anna") && filled.includes("TM-1"));
  check("no token survives substitution", !filled.includes("{{"), filled.match(/\{\{[^}]*\}\}/g) ?? undefined);
}

/* ---- the briefing the model is given ---------------------------------- */
{
  const briefing = mergeTagBriefing();
  const missing = MERGE_TAGS.filter((t) => !briefing.includes(t.token)).map((t) => t.token);
  check("the briefing names every catalogued token", missing.length === 0, missing);
  check("the briefing separates scalars from blocks", briefing.includes("Block tokens"));
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
