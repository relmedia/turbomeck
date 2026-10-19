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
const MAX_SPECS_CHARS = 4000;

/**
 * Hard ceiling for a parcel this shop ships. Mirrors the admin's "Försändelse"
 * section, which offers Lätt (≤3 kg) and Tung (≤15 kg) — there is no pallet
 * option, so a suggestion above this is wrong by definition and is rejected
 * rather than quietly clamped.
 */
const MAX_WEIGHT_KG = 15;

/**
 * The model reports its findings by calling this tool — a tool rather than
 * `output_config.format` because structured outputs and the web-search tool's
 * citations don't combine. `strict: true` guarantees the arguments match.
 */
const SAVE_TOOL: Anthropic.Tool = {
  name: "save_shipping",
  description:
    "Report the shipping weight and packed parcel dimensions for the product. Call this exactly once, after any searching, with only the values you could actually establish.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      weightKg: {
        anyOf: [{ type: "number" }, { type: "null" }],
        description:
          "Shipping weight in kilograms including normal packaging, or null when it cannot be established.",
      },
      lengthCm: {
        anyOf: [{ type: "integer" }, { type: "null" }],
        description:
          "Longest outer dimension of the packed parcel in whole centimetres, or null.",
      },
      widthCm: {
        anyOf: [{ type: "integer" }, { type: "null" }],
        description: "Second-longest outer dimension in whole centimetres, or null.",
      },
      heightCm: {
        anyOf: [{ type: "integer" }, { type: "null" }],
        description: "Shortest outer dimension in whole centimetres, or null.",
      },
      basis: {
        type: "string",
        description:
          'Short Swedish note on where the figures come from, e.g. "tillverkardata" or "uppskattad utifrån liknande turbo". Empty string when nothing was established.',
      },
      sources: {
        type: "array",
        description: "URLs the data was taken from. Empty when nothing was searched.",
        items: { type: "string" },
      },
      notes: {
        type: "string",
        description:
          "One short Swedish sentence for the admin about uncertainty or what to double-check. Empty string when there is nothing to flag.",
      },
    },
    required: [
      "weightKg",
      "lengthCm",
      "widthCm",
      "heightCm",
      "basis",
      "sources",
      "notes",
    ],
    additionalProperties: false,
  },
};

const suggestionSchema = z.object({
  weightKg: z.number().positive().max(MAX_WEIGHT_KG).nullable(),
  lengthCm: z.number().int().positive().max(175).nullable(),
  widthCm: z.number().int().positive().max(100).nullable(),
  heightCm: z.number().int().positive().max(100).nullable(),
  basis: z.string(),
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
    const { name, shortDescription, description, specifications } = body as {
      name?: string;
      shortDescription?: string;
      description?: string;
      specifications?: { label?: string; value?: string }[];
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
    // Specs already on the product are the best evidence for physical size, so
    // pass them along rather than making the model search for them again.
    const safeSpecs = (Array.isArray(specifications) ? specifications : [])
      .map((row) => `${row?.label ?? ""}: ${row?.value ?? ""}`.trim())
      .filter((line) => line !== ":")
      .join("\n")
      .slice(0, MAX_SPECS_CHARS);

    const anthropic = new Anthropic({ apiKey });

    const prompt = `Ta fram fraktvikt och paketmått för den här produkten i en svensk webbshop för turbodelar. Måtten ska vara det färdiga paketets yttermått, inte delens egna mått.

Produktnamn: ${safeName || "(okänt)"}
Kort beskrivning: ${safeShort || "(saknas)"}
Full beskrivning (kan innehålla HTML): ${safeDescription || "(saknas)"}
Kända specifikationer:
${safeSpecs || "(saknas)"}

Arbetsordning:
1. Läs ut allt som redan står ovan — hjulmått, turbinhus och anslutningar säger mycket om både vikt och storlek.
2. Sök på webben efter tillverkarens eller återförsäljares data för exakt den här modellen om något saknas. Prioritera tillverkardata.
3. Rapportera med verktyget save_shipping.

Regler:
- Hitta INTE på värden. Går något inte att belägga eller uppskatta rimligt: null för det fältet.
- Gäller träffen en annan modell eller variant än den efterfrågade: använd den inte.
- Vikten är fraktvikt i kilo inklusive emballage. Butiken skickar paket på högst ${MAX_WEIGHT_KG} kg — överstiger produkten det är något fel, rapportera null och förklara i notes.
- Måtten är hela centimeter för det packade paketet, inklusive emballage och med lite marginal. lengthCm är längsta måttet, heightCm det kortaste.
- En typisk turbo i kartong ligger på 3–8 kg och ungefär 30 × 25 × 25 cm. Använd det som rimlighetskontroll, inte som svar.
- Är siffrorna uppskattade ska det tydligt framgå i basis.`;

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
          "Du är produktdataspecialist på en svensk turbodelsbutik och förbereder frakt. Du tar fram fraktvikt och paketmått och är noggrann med att aldrig gissa värden du inte kan belägga eller rimligt uppskatta. Avsluta alltid med att anropa save_shipping.",
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
      console.error("Suggest-shipping refused:", message.stop_details);
      return NextResponse.json(
        { error: "AI avböjde att hämta fraktuppgifter för den här produkten." },
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
      console.error("Suggest-shipping: no tool call.", text.slice(0, 300));
      return NextResponse.json(
        { error: "AI hittade inga fraktuppgifter för den här produkten." },
        { status: 502 }
      );
    }

    const parsed = suggestionSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      // A value outside the shop's limits lands here too (e.g. a weight above
      // MAX_WEIGHT_KG), which is the right outcome: better no suggestion than
      // one the Försändelse section cannot represent.
      console.error("Suggest-shipping: unexpected tool input:", parsed.error.message);
      return NextResponse.json({ error: "Oväntat svar från AI." }, { status: 500 });
    }

    const { weightKg, lengthCm, widthCm, heightCm } = parsed.data;
    if (weightKg == null && lengthCm == null && widthCm == null && heightCm == null) {
      return NextResponse.json(
        {
          error:
            parsed.data.notes.trim() ||
            "AI kunde inte fastställa vikt eller mått för den här produkten.",
        },
        { status: 502 }
      );
    }

    // Longest edge first, so the values line up with the form's Längd/Bredd/Höjd
    // ranges however the model happened to order them.
    const dims = [lengthCm, widthCm, heightCm]
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => b - a);
    const allThree = dims.length === 3;

    return NextResponse.json({
      weightKg,
      lengthCm: allThree ? dims[0] : lengthCm,
      widthCm: allThree ? dims[1] : widthCm,
      heightCm: allThree ? dims[2] : heightCm,
      basis: parsed.data.basis.trim(),
      // Only real links are useful to the admin for checking the data.
      sources: parsed.data.sources.filter((url) => /^https?:\/\//i.test(url)).slice(0, 10),
      notes: parsed.data.notes.trim(),
    });
  } catch (err) {
    console.error("Suggest-shipping API error:", err);
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic (${err.status ?? "?"}): ${err.message}` },
        { status: 502 }
      );
    }
    const messageText =
      err instanceof Error ? err.message : "Kunde inte hämta fraktuppgifter.";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
