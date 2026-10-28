/**
 * End-to-end check of AI template generation, against the real model.
 *
 * Everything else about this feature is covered by pure harnesses. The thing
 * they cannot show is whether a REAL model, given the real system prompt and
 * tool schema, produces a spec that survives validation and becomes a design
 * that opens in the editor. A fixture spec proves the validator; only a live
 * call proves the prompt.
 *
 * Costs one API call per run, so it takes the prompt as an argument and does
 * nothing by default.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/admin/.env \
 *     apps/product-service/src/__verify-ai-generation.ts <out-dir> [locale]
 */

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDesignFromSpec, mergeTagBriefing, PALETTE_HINT } from "../../../product-service/src/email-design-from-spec.js";
import { MERGE_TAGS, applyMergeTags } from "../../../product-service/src/email-merge-tags.js";

const outDir = process.argv[2];
const locale = process.argv[3] === "en" ? "en" : "sv";
if (!outDir) {
  console.error("usage: __verify-ai-generation.ts <out-dir> [sv|en]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/**
 * The same tool schema and system prompt the admin route sends. Duplicated
 * knowingly: the point is to exercise what production uses, and the route
 * lives in the Next app where importing it here would drag in the whole
 * framework.
 */
const SPEC_TOOL: Anthropic.Tool = {
  name: "emit_email_template",
  description:
    "Return the finished email template as an ordered list of blocks. Every block is rendered top to bottom in the email.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string" },
      blocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["heading", "text", "button", "divider", "token"] },
            text: { type: "string" },
            icon: { type: "string" },
            html: { type: "string" },
            label: { type: "string" },
            href: { type: "string" },
            color: { type: "string" },
            token: { type: "string" },
          },
          required: ["type"],
        },
      },
    },
    required: ["subject", "blocks"],
  },
};

const PROMPTS: Array<{ name: string; templateKey: string | null; prompt: string }> = [
  {
    name: "confirmation",
    templateKey: "order_confirmation",
    prompt:
      "Kort och varmt tack för köpet. Visa produkterna och summan, och berätta att spårningsnummer kommer på mejl när vi skickat paketet.",
  },
  {
    name: "pickup",
    templateKey: "ready_for_pickup",
    prompt:
      "Berätta att paketet finns att hämta hos ombudet, påminn om legitimation, och ha en knapp till spårningen.",
  },
  {
    name: "campaign",
    templateKey: null,
    prompt:
      "Ett fristående mejl om att vi har kampanj på turbos i november, med en knapp till butiken på https://turbomeck.se.",
  },
];

const KNOWN = new Set(MERGE_TAGS.map((t) => t.token));

async function main() {
  const anthropic = new Anthropic({ apiKey });
  const language = locale === "en" ? "English" : "Swedish";
  const index: Array<{ file: string; name: string }> = [];

  for (const task of PROMPTS) {
    console.log(`\n--- ${task.name} (${locale}) ---`);

    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5",
      max_tokens: 8000,
      output_config: { effort: "medium" },
      tools: [SPEC_TOOL],
      tool_choice: { type: "tool", name: "emit_email_template" },
      system:
        `You design transactional emails for Turbomeck, a Swedish online shop selling turbochargers ` +
        `and car parts. The tone is warm, direct and practical — never salesy, never corporate filler.\n\n` +
        `Write all customer-facing copy in ${language}.\n\n` +
        `Use merge tokens for anything that varies per order. Never invent a token; only these exist:\n\n` +
        `${mergeTagBriefing()}\n\n${PALETTE_HINT}\n\n` +
        `Rules that will be enforced and will cause a rejection if broken:\n` +
        `- Block tokens go in their own {"type":"token"} block, never inside text.\n` +
        `- Text blocks allow inline tags only (strong, em, a, br). No <p>, <table>, <div> or style attributes.\n` +
        `- Button links must be a scalar token, an https:// URL, or mailto:. Never javascript: or http://.\n` +
        `- Colours must be six-digit hex.\n` +
        `- Keep it to roughly 6-12 blocks. A wall of text is worse than a short, clear email.`,
      messages: [{ role: "user", content: `Design the email. The shop owner describes it like this:\n\n${task.prompt}` }],
    });

    check(`${task.name}: the model did not refuse`, message.stop_reason !== "refusal", message.stop_reason);

    const toolUse = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    check(`${task.name}: returned a tool call`, Boolean(toolUse));
    if (!toolUse) continue;

    const spec = toolUse.input as { subject?: string; blocks?: Array<Record<string, unknown>> };
    console.log(`       ${spec.blocks?.length ?? 0} blocks, subject: ${String(spec.subject).slice(0, 60)}`);

    /** The real question: does what it produced survive validation? */
    let built;
    try {
      built = buildDesignFromSpec(spec);
      check(`${task.name}: the spec passes validation`, true);
    } catch (err) {
      check(`${task.name}: the spec passes validation`, false, String(err));
      writeFileSync(join(outDir, `rejected.${task.name}.json`), JSON.stringify(spec, null, 2), "utf8");
      continue;
    }

    const rows = (built.design as { body: { rows: unknown[] } }).body.rows.length;
    check(`${task.name}: produced a design with rows`, rows >= 4, rows);
    check(`${task.name}: produced a subject`, built.subject.trim().length > 0, built.subject);
    check(`${task.name}: no validation warnings`, built.warnings.length === 0, built.warnings);

    /** Every token it chose must be one the substitution can actually fill. */
    const text = JSON.stringify(built.design);
    const used = [...text.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1]!.toLowerCase());
    const invented = [...new Set(used)].filter((t) => !KNOWN.has(t));
    check(`${task.name}: invented no merge tokens`, invented.length === 0, invented);

    /** And the design must fill in cleanly, leaving nothing in braces. */
    const scalars = Object.fromEntries(
      MERGE_TAGS.filter((t) => t.kind === "scalar").map((t) => [t.token, t.sample]),
    );
    const blocks = Object.fromEntries(
      MERGE_TAGS.filter((t) => t.kind === "block").map((t) => [t.token, "<table></table>"]),
    );
    const filled = applyMergeTags(text, { scalars, blocks });
    check(`${task.name}: substitutes with nothing left over`, !filled.includes("{{"), filled.match(/\{\{[^}]*\}\}/g)?.slice(0, 3));

    const file = `ai.${task.name}.${locale}.json`;
    writeFileSync(join(outDir, file), JSON.stringify(built.design, null, 2), "utf8");
    index.push({ file, name: task.name });
  }

  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`\n${index.length} designs written to ${outDir}`);
  console.log(`${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
