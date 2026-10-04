import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
// Web search runs server-side and can take several round trips.
export const maxDuration = 180;

/** Default: Claude Opus 5 — override with ANTHROPIC_MODEL if needed. */
const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

// SECURITY (audit M7): cap user-controlled prompt fragments, same rationale as
// the other AI routes — keep the bill bounded whatever an admin pastes in.
const MAX_NAME_CHARS = 500;
const MAX_SHORT_DESCRIPTION_CHARS = 4000;
const MAX_DESCRIPTION_CHARS = 32000;

/** Groups the product page renders as spec table headings. */
const SPEC_GROUPS = ["Kompressor", "Turbin", "Anslutningar", "Övrigt"] as const;

/**
 * The model reports its findings by calling this tool — a tool rather than
 * `output_config.format` because structured outputs and the web-search tool's
 * citations don't combine. `strict: true` guarantees the arguments match.
 */
const SAVE_TOOL: Anthropic.Tool = {
  name: "save_specifications",
  description:
    "Report the technical specifications and shipping weight found for the product. Call this exactly once, after any searching, with only the values you could actually verify.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      specifications: {
        type: "array",
        description:
          "Technical spec rows, ordered the way they should appear on the product page.",
        items: {
          type: "object",
          properties: {
            group: {
              type: "string",
              enum: [...SPEC_GROUPS],
              description: "Heading the row belongs under.",
            },
            label: {
              type: "string",
              description: 'Swedish label, e.g. "Kompressorhjul" or "Turbinhus A/R".',
            },
            value: {
              type: "string",
              description: 'Value with unit, e.g. "48,5 × 61 mm".',
            },
          },
          required: ["group", "label", "value"],
          additionalProperties: false,
        },
      },
      weightKg: {
        anyOf: [{ type: "number" }, { type: "null" }],
        description:
          "Shipping weight in kilograms including normal packaging, or null when it cannot be established.",
      },
      weightBasis: {
        type: "string",
        description:
          'Short Swedish note on where the weight comes from, e.g. "tillverkardata" or "uppskattad utifrån liknande turbo". Empty string when weightKg is null.',
      },
      sources: {
        type: "array",
        description: "URLs the data was taken from. Empty when nothing was searched.",
        items: { type: "string" },
      },
      notes: {
        type: "string",
        description:
          "One short Swedish sentence for the admin about coverage or uncertainty. Empty string when there is nothing to flag.",
      },
    },
    required: ["specifications", "weightKg", "weightBasis", "sources", "notes"],
    additionalProperties: false,
  },
};

const suggestionSchema = z.object({
  specifications: z.array(
    z.object({
      group: z.string(),
      label: z.string(),
      value: z.string(),
    })
  ),
  weightKg: z.number().positive().max(500).nullable(),
  weightBasis: z.string(),
  sources: z.array(z.string()),
  notes: z.string(),
});

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured. Add it to apps/admin .env or .env.local.",
      },
      { status: 503 }
    );
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;

  try {
    const body = await req.json();
    const { name, shortDescription, description } = body as {
      name?: string;
      shortDescription?: string;
      description?: string;
    };

    if (!name?.trim() && !shortDescription?.trim() && !description?.trim()) {
      return NextResponse.json(
        { error: "Fyll i produktnamn eller beskrivning först." },
        { status: 400 }
      );
    }

    const safeName = (name ?? "").slice(0, MAX_NAME_CHARS);
    const safeShort = (shortDescription ?? "").slice(0, MAX_SHORT_DESCRIPTION_CHARS);
    const safeDescription = (description ?? "").slice(0, MAX_DESCRIPTION_CHARS);

    const anthropic = new Anthropic({ apiKey });

    const prompt = `Ta fram tekniska specifikationer och fraktvikt för den här produkten i en svensk webbshop för turbodelar.

Produktnamn: ${safeName || "(okänt)"}
Kort beskrivning: ${safeShort || "(saknas)"}
Full beskrivning (kan innehålla HTML): ${safeDescription || "(saknas)"}

Arbetsordning:
1. Läs ut allt som redan står i produkttexten ovan (hjulmått, antal blad, turbinhus, anslutningar, bearbetning).
2. Sök på webben efter tillverkarens eller återförsäljares datablad för exakt den här modellen om något saknas. Prioritera tillverkardata.
3. Rapportera med verktyget save_specifications.

Regler:
- Hitta INTE på värden. Ta bara med rader du kan belägga i produkttexten eller i en källa du hittat. Hellre få rader än osäkra rader.
- Gäller träffen en annan modell eller variant än den efterfrågade: använd den inte.
- Svenska etiketter och värden, metriska enheter (mm, kg, bar). Decimalkomma.
- Vikten är fraktvikt i kilo inklusive normalt emballage, för fraktberäkning. Är den uppskattad ska det framgå i weightBasis. Går den inte att belägga: null.`;

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

    let message: Anthropic.Message | null = null;
    // Server-side tool loops pause after 10 iterations; resume a bounded number
    // of times by sending the conversation back unchanged.
    for (let attempt = 0; attempt < 4; attempt++) {
      message = await anthropic.messages.create({
        model,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system:
          "Du är produktdataspecialist på en svensk turbodelsbutik. Du letar upp tekniska specifikationer och är noggrann med att aldrig gissa värden. Avsluta alltid med att anropa save_specifications.",
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 6 },
          SAVE_TOOL,
        ],
        messages,
      });

      if (message.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: message.content });
    }

    if (!message) {
      return NextResponse.json({ error: "Inget svar från AI." }, { status: 500 });
    }

    if (message.stop_reason === "refusal") {
      console.error("Suggest-specifications refused:", message.stop_details);
      return NextResponse.json(
        { error: "AI avböjde att hämta specifikationer för den här produkten." },
        { status: 502 }
      );
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === SAVE_TOOL.name
    );

    if (!toolUse) {
      // No tool call means the model found nothing worth reporting; surface the
      // text it did produce so the admin knows why.
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim();
      console.error("Suggest-specifications: no tool call.", text.slice(0, 300));
      return NextResponse.json(
        { error: "AI hittade inga specifikationer för den här produkten." },
        { status: 502 }
      );
    }

    const parsed = suggestionSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      console.error("Suggest-specifications: unexpected tool input:", parsed.error.message);
      return NextResponse.json({ error: "Oväntat svar från AI." }, { status: 500 });
    }

    const specifications = parsed.data.specifications
      .map((row) => ({
        group: row.group.trim().slice(0, 60),
        label: row.label.trim().slice(0, 80),
        value: row.value.trim().slice(0, 200),
      }))
      .filter((row) => row.label !== "" && row.value !== "")
      .slice(0, 40);

    return NextResponse.json({
      specifications,
      weightKg: parsed.data.weightKg,
      weightBasis: parsed.data.weightBasis.trim(),
      // Only real links are useful to the admin for checking the data.
      sources: parsed.data.sources.filter((url) => /^https?:\/\//i.test(url)).slice(0, 10),
      notes: parsed.data.notes.trim(),
    });
  } catch (err) {
    console.error("Suggest-specifications API error:", err);
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic (${err.status ?? "?"}): ${err.message}` },
        { status: 502 }
      );
    }
    const messageText = err instanceof Error ? err.message : "Kunde inte hämta specifikationer.";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
