import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_CLAUDE_MODEL = "claude-opus-4-5-20251101";

export async function POST(req: NextRequest) {
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
    const { name, shortDescription } = body as {
      name?: string;
      shortDescription?: string;
    };

    if (!shortDescription?.trim()) {
      return NextResponse.json(
        { error: "Kort beskrivning krävs för att skapa ett förslag." },
        { status: 400 },
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const prompt = `Baserat på produktnamn och kort beskrivning nedan, skriv en fullständig produktbeskrivning på svenska för en e-handel (turbo/delar till fordon om relevant). 
Utöka innehållet med relevanta detaljer: passform, viktiga specifikationer, vad som ingår, skötselråd eller garanti om det passar — men håll dig till rimliga antaganden utifrån texten; hitta inte på exakta OEM-nummer eller garantier som inte nämns.
Returnera ENDAST giltig JSON med en nyckel "description" vars värde är HTML-sträng med enkel struktur: använd <p> för stycken, <ul><li> för punktlistor där det passar, <strong> för betoning. Inga markdown-kodblock, ingen förklarande text utanför JSON.

Produktnamn: ${name?.trim() || "(okänt)"}
Kort beskrivning: ${shortDescription.trim()}`;

    const message = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      temperature: 0.45,
      system:
        'Du skriver professionella svenska produkttexter. Svara endast med giltig JSON: {"description": "<html...>"}',
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "Inget förslag returnerades från AI." },
        { status: 500 },
      );
    }

    const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(jsonStr) as { description?: string };

    const description = String(parsed.description ?? "").trim();
    if (!description) {
      return NextResponse.json(
        { error: "Tom beskrivning i AI-svar." },
        { status: 500 },
      );
    }

    return NextResponse.json({ description });
  } catch (err) {
    console.error("Suggest description API error:", err);
    const message = err instanceof Error ? err.message : "Kunde inte skapa förslag";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
