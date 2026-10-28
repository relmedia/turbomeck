import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

/**
 * Generates an email template from a description.
 *
 * ## The model never writes Unlayer JSON
 *
 * It fills in a seven-block spec, and product-service converts that to a
 * design with the builders whose output is verified to open in the editor.
 * The reason is the failure shape: a design with a subtly wrong field does
 * not throw, it opens BLANK — invisible to anything that only parses JSON,
 * and indistinguishable to the admin from the feature being broken.
 *
 * Tool use rather than "reply with JSON" for the same reason. A schema the
 * API enforces beats parsing JSON out of prose, which fails on a stray
 * markdown fence or a sentence of preamble.
 *
 * ## Where the trust boundary is
 *
 * Nothing here is trusted. The prompt is admin-written and the spec is
 * model-written, and both are validated in product-service before anything
 * is built — script tags, CSS injection through a colour, `javascript:`
 * links and invented merge tokens are all refused there, not here. This
 * route's own job is the API key, the length caps, and the admin gate.
 *
 * Nothing is saved: the design comes back to the browser, loads into the
 * editor, and the admin decides whether to keep it.
 *
 * ## Pictures
 *
 * A `logo` block is resolved by product-service from the shop's own
 * configuration — the model is never asked to guess that URL, and cannot
 * point an email at anything else.
 */

// SECURITY (mirrors M7 on the other AI routes): cap the admin-controlled
// prompt. Without it a long prompt can burn tokens or carry an injection
// payload large enough to push the real instructions out of attention.
const MAX_PROMPT_CHARS = 2000;

const SPEC_TOOL: Anthropic.Tool = {
  name: "emit_email_template",
  description:
    "Return the finished email template as an ordered list of blocks. Every block is rendered " +
    "top to bottom in the email.",
  input_schema: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description:
          "The email subject line. May contain scalar merge tokens such as {{order_number}}.",
      },
      blocks: {
        type: "array",
        description: "The blocks, in the order they should appear.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["heading", "text", "button", "divider", "token", "logo"],
              description:
                "heading = large centred title with an optional emoji; text = a paragraph; " +
                "button = a call to action; divider = a horizontal rule; token = a server-rendered " +
                "block such as the order lines; logo = the shop's own logo, resolved by the server.",
            },
            text: { type: "string", description: "heading only: the title." },
            icon: { type: "string", description: "heading only: one emoji." },
            html: {
              type: "string",
              description:
                "text only: the paragraph. Inline tags <strong> <em> <a> <br> only — no <p>, " +
                "no <table>, no style attributes. May contain scalar merge tokens.",
            },
            label: { type: "string", description: "button only: the button text." },
            href: {
              type: "string",
              description:
                "button only: a scalar merge token like {{tracking_url}}, an https:// URL, or a " +
                "mailto: address. Nothing else is permitted.",
            },
            color: {
              type: "string",
              description: "button only: background as a six-digit hex colour, e.g. #16a34a.",
            },
            token: {
              type: "string",
              description:
                "token only: the name of a BLOCK token, without braces. Use each at most once.",
            },
          },
          required: ["type"],
        },
      },
    },
    required: ["subject", "blocks"],
  },
};

/** What each bindable template is for, so the copy suits the moment. */
const TEMPLATE_CONTEXT: Record<string, string> = {
  order_confirmation:
    "the order confirmation, sent immediately after a customer pays. It should thank them, show what they bought and what happens next.",
  ready_for_pickup:
    "the notice that a parcel has arrived at the customer's PostNord pickup point and can be collected. PostNord holds it for 3 days.",
  pickup_reminder_1:
    "a first friendly reminder that an uncollected parcel is still waiting at the pickup point.",
  pickup_reminder_2:
    "a final reminder that an uncollected parcel is about to be returned to the shop.",
  order_delivered: "the confirmation that a parcel has been delivered.",
  core_return_reminder:
    "a reminder to send back the old turbo (kärnretur) within the agreed period, or a fee may be invoiced.",
};

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
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "INTERNAL_PRODUCT_API_SECRET saknas" }, { status: 503 });
  }

  let body: { prompt?: string; locale?: string; templateKey?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON i begäran." }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Beskriv vad mallen ska innehålla." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `För lång beskrivning (max ${MAX_PROMPT_CHARS} tecken).` },
      { status: 413 },
    );
  }

  const locale = body.locale === "en" ? "en" : "sv";
  const templateKey = (body.templateKey ?? "").trim();

  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/u, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);

  try {
    /**
     * The token catalogue comes from product-service, where the substitution
     * that fills the tokens lives. Fetching it rather than restating it here
     * is what stops the model being told about a token nothing can fill.
     */
    const briefingRes = await fetch(`${base}/api/email-templates/ai-briefing`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!briefingRes.ok) {
      return NextResponse.json(
        { error: "Kunde inte hämta tillgängliga taggar" },
        { status: 502 },
      );
    }
    const briefing = (await briefingRes.json()) as { tokens: string; palette: string };

    const anthropic = new Anthropic({ apiKey });
    const language = locale === "en" ? "English" : "Swedish";
    const purpose = templateKey ? TEMPLATE_CONTEXT[templateKey] : undefined;

    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL,
      max_tokens: 8000,
      output_config: { effort: "medium" },
      tools: [SPEC_TOOL],
      tool_choice: { type: "tool", name: "emit_email_template" },
      system:
        `You design transactional emails for Turbomeck, a Swedish online shop selling turbochargers ` +
        `and car parts. The tone is warm, direct and practical — never salesy, never corporate filler.\n\n` +
        `Write all customer-facing copy in ${language}.\n\n` +
        `Use merge tokens for anything that varies per order. Never invent a token; only these exist:\n\n` +
        `${briefing.tokens}\n\n${briefing.palette}\n\n` +
        `Pictures:\n` +
        `- Start the email with a {"type":"logo"} block unless the shop owner says otherwise. The server fills in the real logo; you do not supply a URL.\n` +
        `\n` +
        `Rules that will be enforced and will cause a rejection if broken:\n` +
        `- Block tokens go in their own {"type":"token"} block, never inside text.\n` +
        `- Text blocks allow inline tags only (strong, em, a, br). No <p>, <table>, <div> or style attributes.\n` +
        `- Button links must be a scalar token, an https:// URL, or mailto:. Never javascript: or http://.\n` +
        `- Colours must be six-digit hex.\n` +
        `- Keep it to roughly 6-12 blocks. A wall of text is worse than a short, clear email.`,
      messages: [
        {
          role: "user",
          content:
            (purpose ? `This template is ${purpose}\n\n` : "") +
            `Design the email. The shop owner describes it like this:\n\n${prompt}`,
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      console.error("[designs/generate] refused:", message.stop_details);
      return NextResponse.json(
        { error: "AI avböjde att skapa den här mallen." },
        { status: 502 },
      );
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return NextResponse.json(
        { error: "AI returnerade ingen mall. Försök igen med en tydligare beskrivning." },
        { status: 502 },
      );
    }

    /**
     * Converted in product-service, not here: that is where the verified
     * builders and the validation live, and validating in the same place the
     * spec was produced would be no validation at all.
     */
    const buildRes = await fetch(`${base}/api/email-templates/from-spec`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ spec: toolUse.input }),
      cache: "no-store",
    });
    const built = (await buildRes.json().catch(() => ({}))) as {
      error?: string;
      design?: unknown;
      subject?: string;
      warnings?: string[];
    };
    if (!buildRes.ok) {
      return NextResponse.json(
        { error: built.error ?? `Mallen kunde inte byggas (HTTP ${buildRes.status})` },
        { status: buildRes.status === 422 ? 422 : 502 },
      );
    }

    return NextResponse.json({
      design: built.design,
      subject: built.subject,
      warnings: built.warnings ?? [],
    });
  } catch (err) {
    console.error("[designs/generate]", err);
    const message = err instanceof Error ? err.message : "Kunde inte generera mallen";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
