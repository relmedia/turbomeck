/**
 * Runs the real model over the shop's real product names.
 *
 * The pure harness proves the filter rejects a changed part number. This
 * proves the thing that cannot be checked offline: that the prompt actually
 * produces usable Swedish copy for THIS catalogue, and that what survives the
 * filter is worth showing.
 *
 * The assertion that matters is the part number. A name "improved" from
 * TD04HL-19T to TD04HL-20T sells the wrong turbo, and a customer would not
 * catch it. Every returned candidate is checked against the codes in the
 * original, the same way the route does.
 *
 * Costs one API call per product, so the list is short and it does nothing
 * unless run deliberately.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json --env-file=apps/admin/.env \
 *     apps/admin/src/lib/__verify-suggest-seo.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  extractCodes,
  missingCodes,
  scoreSeo,
  TITLE_SUFFIX,
  META_LIMIT,
} from "./seo-score";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/** What the prompt asks for; most options should land here. */
const NAME_IDEAL_MIN = 25;
const NAME_IDEAL_MAX = 60 - TITLE_SUFFIX.length;
/** What the route actually rejects. */
const NAME_HARD_MIN = 12;
const NAME_HARD_MAX = 80;

/** Real names from the catalogue, chosen to cover the awkward shapes. */
const PRODUCTS = [
  { name: "TD04HL-19T Upgrade", short: "Turbinhuset är portat för optimerat avgasflöde, vilket ger snabbare turborespons och högre effekt i hela registret." },
  { name: "22T TD04HL SAAB 93/5", short: "Denna TD04HL-baserade turbo är en utmärkt uppgradering för dig som söker mer effekt utan att tappa vardagskörbarheten i din Saab." },
  { name: "Volvo K24-k26 anpassad för 940-740", short: "Uppgraderad Volvo K24-K26 turbo, specialanpassad för Volvo 940 och 740 med fokus på hållbarhet och jämn effektkurva." },
  { name: "Renoverings sats TD04HL", short: "Renoveringssats för TD04HL-turboaggregat, en komplett Major-reparationssats med allt som behövs för en ordentlig renovering." },
  { name: "Adapter fläns från rak till kona", short: "En praktisk lösning när du behöver anpassa avgassystemet mellan komponenter med olika anslutningar och former." },
  { name: "TD04HL-19T Volvo 2003-2008  2,5T", short: "TD04HL-19T är en beprövad uppgradering för dig som vill ha mer kraft och bättre respons i din Volvo utan att byta hela systemet." },
];

const TOOL: Anthropic.Tool = {
  name: "emit_seo_suggestions",
  description: "Return improved product copy for search.",
  input_schema: {
    type: "object",
    properties: {
      names: {
        type: "array",
        items: {
          type: "object",
          properties: { text: { type: "string" }, why: { type: "string" } },
          required: ["text", "why"],
        },
      },
      shortDescription: { type: "string" },
      nameEn: { type: "string" },
      shortDescriptionEn: { type: "string" },
    },
    required: ["names", "shortDescription", "nameEn", "shortDescriptionEn"],
  },
};

/** The route's system prompt, kept in step by hand; see the note below. */
const SYSTEM =
  `You write product copy for Turbomeck, a Swedish shop selling turbochargers and ` +
  `parts for Saab, Volvo and similar cars. Customers are mechanics and enthusiasts ` +
  `searching Google in Swedish for things like "turbo saab 9-3", ` +
  `"renoveringssats td04hl" or "wastegate volvo 940".\n\n` +
  `The product NAME becomes the page title, and the site appends "${TITLE_SUFFIX}" ` +
  `to it. The SHORT DESCRIPTION becomes the meta description shown under the title ` +
  `in Google, cut off at ${META_LIMIT} characters.\n\n` +
  `A good name says three things: what the part IS (turbo, wastegate, ` +
  `renoveringssats), which model or part number it is, and which car it fits. ` +
  `Write plainly. No marketing noise, no "bästa", no exclamation marks, no ALL CAPS, ` +
  `no keyword stuffing — a name reading "turbo turbo saab turbo" ranks worse, not better.\n\n` +
  `NEVER change, drop or invent a part number, model code, engine size or year range. ` +
  `Selling the wrong part is far worse than a dull name. If you are unsure what a code ` +
  `means, carry it through unchanged.\n\n` +
  `Do not invent facts — no power figures, no fitment, no warranty, no stock claims ` +
  `that are not already in the text you are given.`;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey });

  let improved = 0;

  for (const product of PRODUCTS) {
    const codes = extractCodes(product.name);
    console.log(`\n--- ${product.name}  (codes: ${codes.join(", ") || "none"}) ---`);

    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      tools: [TOOL],
      tool_choice: { type: "tool", name: "emit_seo_suggestions" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Current name: ${product.name}\n` +
            (codes.length ? `Codes that must survive unchanged: ${codes.join(", ")}\n` : "") +
            `Current short description: ${product.short}\n` +
            `\nSuggest better copy for search.`,
        },
      ],
    });

    check(`${product.name}: not refused`, message.stop_reason !== "refusal", message.stop_reason);
    const toolUse = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    check(`${product.name}: returned suggestions`, Boolean(toolUse));
    if (!toolUse) continue;

    const out = toolUse.input as {
      names?: Array<{ text?: string; why?: string }>;
      shortDescription?: string;
      nameEn?: string;
    };
    const names = (out.names ?? []).map((n) => String(n?.text ?? "").trim()).filter(Boolean);
    check(`${product.name}: three name options`, names.length >= 3, names.length);

    for (const candidate of names) {
      console.log(`       ${candidate.length.toString().padStart(2)}  ${candidate}`);
    }

    /* ---- the one that matters ------------------------------------------ */
    const broke = names.filter((n) => missingCodes(product.name, n).length > 0);
    check(
      `${product.name}: every option keeps its part numbers`,
      broke.length === 0,
      broke.map((n) => ({ name: n, lost: missingCodes(product.name, n) })),
    );

    /* ---- bounds and hygiene -------------------------------------------- */
    /** Unusable lengths are rejected outright. */
    const unusable = names.filter((n) => n.length < NAME_HARD_MIN || n.length > NAME_HARD_MAX);
    check(
      `${product.name}: no unusable lengths`,
      unusable.length === 0,
      unusable.map((n) => ({ name: n, length: n.length })),
    );
    /**
     * The ideal band is guidance, not a rule — Google truncates on pixel
     * width, and a longer name that reads better is often the right pick. So
     * this only asks that the admin always HAS a well-sized option; the panel
     * shows each one's title length and they choose.
     */
    const inBand = names.filter((n) => n.length >= NAME_IDEAL_MIN && n.length <= NAME_IDEAL_MAX);
    check(
      `${product.name}: at least one option fits the title band`,
      inBand.length >= 1,
      { inBand: inBand.length, of: names.length, lengths: names.map((n) => n.length) },
    );
    check(`${product.name}: no markup`, !names.some((n) => /[<>]/.test(n)));
    check(`${product.name}: no shouting`, !names.some((n) => /[A-ZÅÄÖ]{6,}/.test(n.replace(/[A-Z0-9-]{2,}/g, ""))));
    check(
      `${product.name}: nothing identical to the original`,
      !names.some((n) => n.toLowerCase() === product.name.toLowerCase()),
    );

    const desc = String(out.shortDescription ?? "").trim();
    check(`${product.name}: a description came back`, desc.length > 0);
    check(`${product.name}: description fits the snippet`, desc.length <= META_LIMIT, desc.length);
    check(`${product.name}: description is plain text`, !/[<>]/.test(desc));

    /* ---- did it actually help? ----------------------------------------- */
    const before = scoreSeo({ name: product.name, shortDescription: product.short });
    const after = scoreSeo({ name: names[0] ?? product.name, shortDescription: desc || product.short });
    console.log(`       score ${before.score} -> ${after.score}`);
    if (after.score > before.score) improved++;
  }

  /**
   * Not asserted per product — a name that was already good has nowhere to
   * go, and forcing an improvement would be rewarding keyword stuffing. But
   * across a set picked for being weak, most should get better.
   */
  check(
    `the suggestions improve most of the weak names`,
    improved >= Math.ceil(PRODUCTS.length * 0.6),
    { improved, of: PRODUCTS.length },
  );

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
