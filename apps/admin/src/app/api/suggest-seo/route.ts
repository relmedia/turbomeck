import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  extractCodes,
  missingCodes,
  metaDescriptionFor,
  META_LIMIT,
  TITLE_SUFFIX,
} from "@/lib/seo-score";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

/**
 * Suggests a better product name and short description for search.
 *
 * ## What these two fields actually are
 *
 * Not generic "SEO copy". In this app the name IS the `<title>` (the layout
 * appends " | Turbomeck") and the H1; the short description IS the meta
 * description, cut at 160 characters. So the lengths the model is asked for
 * are the real budgets, taken from the same constants the live scorer uses.
 *
 * ## The guarantee that matters
 *
 * This is a turbo parts shop. A name "improved" from TD04HL-19T to
 * TD04HL-20T sells the wrong part — an error worse than any bad phrasing,
 * and not one a customer would catch. The prompt says so, and then every
 * candidate is CHECKED: model codes are extracted from the original name and
 * a candidate missing any of them is dropped before it is ever shown.
 *
 * Prompt wording is a request; the filter is the guarantee.
 *
 * Suggests only — nothing is saved. The admin clicks one to fill the field.
 */

// SECURITY (mirrors M7 on the other AI routes): cap the admin-controlled
// input so a long paste cannot burn tokens or carry an injection payload
// large enough to push the real instructions out of attention.
const MAX_NAME = 200;
const MAX_DESC = 2000;

/**
 * The length the model is ASKED for: a title of ~60 characters, minus what
 * the layout appends.
 */
const NAME_IDEAL_MIN = 25;
const NAME_IDEAL_MAX = 60 - TITLE_SUFFIX.length;
const DESC_MIN = 110;
const DESC_MAX = META_LIMIT - 5;

/**
 * The length that gets a suggestion THROWN AWAY — deliberately much wider.
 *
 * An earlier version rejected anything outside the ideal band, and threw away
 * good names for being one character over: "Turbo TD04HL-19T, Volvo 2,5T,
 * årsmodell 2003-2008" at 49 against a limit of 48. Google truncates on pixel
 * width anyway, so the band is guidance, not a rule.
 *
 * Rejection is reserved for what is actually unusable or unsafe. Length is
 * reported instead, and the panel shows the resulting title length for every
 * option so the choice stays with the admin.
 */
const NAME_HARD_MIN = 12;
const NAME_HARD_MAX = 80;

const SUGGEST_TOOL: Anthropic.Tool = {
  name: "emit_seo_suggestions",
  description:
    "Return improved product copy for search. Every string is customer-facing and must read naturally.",
  input_schema: {
    type: "object",
    properties: {
      names: {
        type: "array",
        description: `Three alternative Swedish product names, ${NAME_IDEAL_MIN}-${NAME_IDEAL_MAX} characters each.`,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "The product name." },
            why: {
              type: "string",
              description: "One short Swedish sentence on what this version adds. Max 90 characters.",
            },
          },
          required: ["text", "why"],
        },
      },
      shortDescription: {
        type: "string",
        description: `A Swedish short description, ${DESC_MIN}-${DESC_MAX} characters, plain text only.`,
      },
      nameEn: { type: "string", description: "English version of your best name." },
      shortDescriptionEn: { type: "string", description: "English version of the short description." },
    },
    required: ["names", "shortDescription", "nameEn", "shortDescriptionEn"],
  },
};

type Suggestion = { text: string; why: string; titleLength: number };

/** Strip anything that would end up as literal markup in a title. */
const clean = (value: unknown): string =>
  String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY saknas. Lägg till den i apps/admin .env." },
      { status: 503 },
    );
  }

  let body: { name?: string; shortDescription?: string; description?: string; categories?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON i begäran." }, { status: 400 });
  }

  const name = (body.name ?? "").trim().slice(0, MAX_NAME);
  if (name.length < 3) {
    return NextResponse.json({ error: "Skriv minst tre tecken av produktnamnet." }, { status: 400 });
  }
  const shortDescription = (body.shortDescription ?? "").trim().slice(0, MAX_DESC);
  const description = (body.description ?? "").trim().slice(0, MAX_DESC);
  const categories = (body.categories ?? []).slice(0, 10).map((c) => String(c).slice(0, 60));

  const codes = extractCodes(name);

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "emit_seo_suggestions" },
      system:
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
        `that are not already in the text you are given.`,
      messages: [
        {
          role: "user",
          content:
            `Current name: ${name}\n` +
            (codes.length ? `Codes that must survive unchanged: ${codes.join(", ")}\n` : "") +
            (categories.length ? `Categories: ${categories.join(", ")}\n` : "") +
            (shortDescription ? `Current short description: ${shortDescription}\n` : "") +
            (description ? `Full description (context only, do not rewrite):\n${description}\n` : "") +
            `\nSuggest better copy for search.`,
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      console.error("[suggest-seo] refused:", message.stop_details);
      return NextResponse.json({ error: "AI avböjde att skriva förslag för den här produkten." }, { status: 502 });
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return NextResponse.json({ error: "Inga förslag returnerades." }, { status: 502 });
    }

    const out = toolUse.input as {
      names?: Array<{ text?: string; why?: string }>;
      shortDescription?: string;
      nameEn?: string;
      shortDescriptionEn?: string;
    };

    /**
     * Filter, do not trust. Each rejection is a specific failure the prompt
     * asked the model to avoid, and `rejected` is returned so the UI can say
     * why a suggestion list came back short rather than looking broken.
     */
    const rejected: string[] = [];
    const names: Suggestion[] = [];
    for (const candidate of out.names ?? []) {
      const text = clean(candidate?.text);
      if (!text) continue;

      const lost = missingCodes(name, text);
      if (lost.length > 0) {
        rejected.push(`"${text}" ändrade eller tappade ${lost.join(", ")}`);
        continue;
      }
      if (text.toLowerCase() === name.toLowerCase()) continue;
      if (text.length < NAME_HARD_MIN || text.length > NAME_HARD_MAX) {
        rejected.push(`"${text}" var ${text.length} tecken`);
        continue;
      }
      /**
       * The resulting title length travels with the suggestion so the panel
       * can show it, rather than the server silently deciding for the admin.
       */
      names.push({
        text,
        why: clean(candidate?.why).slice(0, 120),
        titleLength: text.length + TITLE_SUFFIX.length,
      });
    }

    const suggestedDescription = clean(out.shortDescription);
    /**
     * A description over the limit would be silently truncated on the page,
     * so it is cut here instead — at a word, through the same helper the page
     * uses, so what is offered is what would ship.
     */
    const shortDescriptionOut =
      suggestedDescription.length > META_LIMIT
        ? metaDescriptionFor(suggestedDescription, name)
        : suggestedDescription;

    const nameEn = clean(out.nameEn);
    const englishKeepsCodes = !nameEn || missingCodes(name, nameEn).length === 0;

    if (names.length === 0 && !shortDescriptionOut) {
      return NextResponse.json(
        {
          error:
            rejected.length > 0
              ? `Alla förslag förkastades: ${rejected.join("; ")}`
              : "Inga användbara förslag returnerades. Försök igen.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      names,
      shortDescription: shortDescriptionOut,
      nameEn: englishKeepsCodes ? nameEn : "",
      shortDescriptionEn: clean(out.shortDescriptionEn),
      rejected,
    });
  } catch (err) {
    console.error("[suggest-seo]", err);
    const msg = err instanceof Error ? err.message : "Kunde inte hämta förslag";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
