import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Default: Claude Opus 4.5 — override with ANTHROPIC_MODEL if needed. */
const DEFAULT_CLAUDE_MODEL = "claude-opus-4-5-20251101";

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

    const prompt = `Translate the following Swedish product fields to English. Keep the same tone and meaning. For the description, it may contain HTML - translate only the text content inside tags, preserve the HTML structure exactly (e.g. <p>, <ul>, <li>, <strong>). Return valid JSON only, no markdown code block, with keys: nameEn, shortDescriptionEn, descriptionEn. Use empty string for any field that was empty in the input.

Swedish name: ${safeName}
Swedish short description: ${safeShort}
Swedish description (may have HTML): ${safeDescription}`;

    const message = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      temperature: 0.3,
      system:
        "You are a professional translator. Translate Swedish e-commerce product text to natural English. Return only valid JSON with keys nameEn, shortDescriptionEn, descriptionEn. No other text.",
      messages: [{ role: "user", content: prompt }],
    });

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

    const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      nameEn?: string;
      shortDescriptionEn?: string;
      descriptionEn?: string;
    };

    return NextResponse.json({
      nameEn: String(parsed.nameEn ?? "").trim(),
      shortDescriptionEn: String(parsed.shortDescriptionEn ?? "").trim(),
      descriptionEn: String(parsed.descriptionEn ?? "").trim(),
    });
  } catch (err) {
    console.error("Translate API error:", err);
    const message = err instanceof Error ? err.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
