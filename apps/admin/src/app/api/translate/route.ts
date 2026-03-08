import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Add it to your .env.local." },
      { status: 503 },
    );
  }

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

    const openai = new OpenAI({ apiKey });
    const prompt = `Translate the following Swedish product fields to English. Keep the same tone and meaning. For the description, it may contain HTML - translate only the text content inside tags, preserve the HTML structure exactly (e.g. <p>, <ul>, <li>, <strong>). Return valid JSON only, no markdown code block, with keys: nameEn, shortDescriptionEn, descriptionEn. Use empty string for any field that was empty in the input.

Swedish name: ${name || ""}
Swedish short description: ${shortDescription || ""}
Swedish description (may have HTML): ${description || ""}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional translator. Translate Swedish e-commerce product text to natural English. Return only valid JSON with keys nameEn, shortDescriptionEn, descriptionEn. No other text.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "No translation returned from AI." },
        { status: 500 },
      );
    }

    // Parse JSON (strip potential markdown code block)
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
