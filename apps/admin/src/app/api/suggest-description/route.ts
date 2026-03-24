import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_CLAUDE_MODEL = "claude-opus-4-5-20251101";

/** Strip markdown fences and leading chatter; keep HTML body. */
function extractHtmlFromModelOutput(raw: string): string {
  let s = raw.trim();

  // ```html ... ``` or ``` ... ``` (anywhere in reply)
  const fenceMatch = s.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch?.[1]) s = fenceMatch[1].trim();

  // Drop leading "Här är..." lines before first tag
  const tagStart = s.search(/<[a-z!]/i);
  if (tagStart > 0 && tagStart < 500) {
    s = s.slice(tagStart);
  }

  return s.trim();
}

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

Formatera som HTML: <p> för stycken, <ul><li> för punktlistor där det passar, <strong> för betoning.

VIKTIGT: Svara ENDAST med HTML-fragmentet. Ingen JSON, ingen förklarande text före eller efter, inga markdown-kodblock om du kan undvika det.

Produktnamn: ${name?.trim() || "(okänt)"}
Kort beskrivning: ${shortDescription.trim()}`;

    const message = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      temperature: 0.45,
      system:
        "Du skriver professionella svenska produkttexter för e-handel. Svara endast med HTML (fragment), inget annat.",
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

    let description = extractHtmlFromModelOutput(text);

    // Fallback: try JSON if model still returned JSON (older clients / cached behavior)
    if (!description.includes("<") && (text.includes('"description"') || text.trim().startsWith("{"))) {
      try {
        const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
        const match = jsonStr.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : jsonStr) as { description?: string };
        if (parsed.description?.trim()) {
          description = String(parsed.description).trim();
        }
      } catch {
        /* use plain text below */
      }
    }

    if (!description.trim()) {
      return NextResponse.json(
        { error: "Tom beskrivning i AI-svar." },
        { status: 500 },
      );
    }

    // Plain text fallback: wrap in <p> if no tags at all
    if (!/<[a-z][\s\S]*>/i.test(description)) {
      description = `<p>${description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    }

    return NextResponse.json({ description });
  } catch (err) {
    console.error("Suggest description API error:", err);

    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : String(err);
      if (status === 404) {
        return NextResponse.json(
          {
            error: `Modellen hittades inte. Kontrollera ANTHROPIC_MODEL i .env (nu: ${model}).`,
          },
          { status: 502 },
        );
      }
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { error: "Ogiltig eller saknad ANTHROPIC_API_KEY." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: msg || "AI-anrop misslyckades." },
        { status: 502 },
      );
    }

    const message = err instanceof Error ? err.message : "Kunde inte skapa förslag";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
