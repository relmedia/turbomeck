import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
// Claude Opus 5 thinks by default, so a long description takes longer than it
// did on Opus 4.5 even at low effort.
export const maxDuration = 120;

/** Default: Claude Opus 5 — override with ANTHROPIC_MODEL if needed. */
const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

/**
 * Structured output schema: the model is constrained to this shape on the wire,
 * so the response needs no fence-stripping or key guessing.
 *
 * Written as plain JSON schema rather than via the SDK's `zodOutputFormat`
 * helper: that helper is typed against zod v3 but builds the schema with v4's
 * `z.toJSONSchema`, which throws ("Cannot read properties of undefined") on a
 * v3 schema and fails to type-check on a v4 one. Kept in sync with
 * `translationSchema` below, which validates what comes back.
 */
const TRANSLATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    nameEn: { type: "string" },
    shortDescriptionEn: { type: "string" },
    descriptionEn: { type: "string" },
  },
  required: ["nameEn", "shortDescriptionEn", "descriptionEn"],
  additionalProperties: false,
} as const;

const translationSchema = z.object({
  nameEn: z.string(),
  shortDescriptionEn: z.string(),
  descriptionEn: z.string(),
});

// SECURITY (audit M7): cap user-controlled prompt fragments. Same rationale
// as suggest-description: keep the LLM bill bounded even if an admin pastes a
// novel.
const MAX_NAME_CHARS = 500;
const MAX_SHORT_DESCRIPTION_CHARS = 4000;
const MAX_DESCRIPTION_CHARS = 32000;

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
      { status: 503 },
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
        { error: "At least one field (name, shortDescription, description) is required." },
        { status: 400 },
      );
    }

    if (
      (name && name.length > MAX_NAME_CHARS) ||
      (shortDescription && shortDescription.length > MAX_SHORT_DESCRIPTION_CHARS) ||
      (description && description.length > MAX_DESCRIPTION_CHARS)
    ) {
      return NextResponse.json(
        {
          error: `Input too long (max ${MAX_NAME_CHARS}/${MAX_SHORT_DESCRIPTION_CHARS}/${MAX_DESCRIPTION_CHARS} chars).`,
        },
        { status: 413 },
      );
    }

    const safeName = (name ?? "").slice(0, MAX_NAME_CHARS);
    const safeShort = (shortDescription ?? "").slice(0, MAX_SHORT_DESCRIPTION_CHARS);
    const safeDescription = (description ?? "").slice(0, MAX_DESCRIPTION_CHARS);

    const anthropic = new Anthropic({ apiKey: apiKey });

    const prompt = `Translate the following Swedish product fields to English. Keep the same tone and meaning. The description may contain HTML - translate only the text content inside the tags and preserve the HTML structure exactly (e.g. <p>, <ul>, <li>, <strong>). Use an empty string for any field that was empty in the input.

Swedish name: ${safeName}
Swedish short description: ${safeShort}
Swedish description (may have HTML): ${safeDescription}`;

    const message = await anthropic.messages.create({
      model,
      // Shares the budget with thinking on Opus 5, and a long description can
      // translate to several thousand tokens.
      max_tokens: 16000,
      output_config: {
        // Translation is a mechanical task - low effort keeps it fast and cheap.
        effort: "low",
        format: { type: "json_schema", schema: TRANSLATION_JSON_SCHEMA },
      },
      system:
        "You are a professional translator. Translate Swedish e-commerce product text to natural English.",
      messages: [{ role: "user", content: prompt }],
    });

    // Opus 5 can decline a request (HTTP 200 with stop_reason "refusal"), so
    // check before reading the parsed output.
    if (message.stop_reason === "refusal") {
      console.error("Translate refused:", message.stop_details);
      return NextResponse.json(
        { error: "AI avböjde att översätta den här texten." },
        { status: 502 },
      );
    }

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "No translation returned from AI." },
        { status: 500 },
      );
    }

    // The output format constrains the model to TRANSLATION_JSON_SCHEMA, so this
    // is valid JSON of the right shape; validate anyway rather than cast.
    const parsed = translationSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.error("Translate: unexpected response shape:", text.slice(0, 300));
      return NextResponse.json(
        { error: "Oväntat svar från AI." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      nameEn: parsed.data.nameEn.trim(),
      shortDescriptionEn: parsed.data.shortDescriptionEn.trim(),
      descriptionEn: parsed.data.descriptionEn.trim(),
    });
  } catch (err) {
    console.error("Translate API error:", err);
    const message = err instanceof Error ? err.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
