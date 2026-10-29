/**
 * Checks the sign-in email can be designed without locking anyone out.
 *
 * This template is different from the others in one way that matters: it
 * carries a credential. An order confirmation with a broken layout is
 * embarrassing; a sign-in email with no link is a lockout, and nobody
 * notices until support calls start — the recipient simply cannot get in.
 *
 * So the assertions here are mostly about REFUSING a design:
 *
 *  - missing `{{login_url}}` must fall back to the built-in template
 *  - an empty body or subject must fall back
 *  - no design at all must fall back
 *
 * And one about not breaking the link when it IS used: the URL goes into an
 * `href`, and a magic link usually carries `&` between its query parameters.
 * Escaping that to `&amp;` is correct inside an attribute — browsers decode
 * it — but it must not be double-escaped or mangled.
 *
 * Creates and deletes its own rows on a probe locale. Sends no mail.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --env-file=apps/product-service/.env \
 *     apps/product-service/src/__verify-magic-link-design.ts
 */

import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import {
  resolveActiveDesign,
  renderDesign,
  invalidateDesignCache,
} from "@repo/email-design";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const KEY = "magic_link";
/** A locale no real design uses, so live rows are never touched. */
const LOCALE = "zz_probe";

/** A real-shaped magic link: query parameters joined with `&`. */
const LINK =
  "https://turbomeck.se/api/auth/callback/nodemailer?callbackUrl=%2Fkonto&token=abc123&email=kund%40example.se";

const VALUES = {
  scalars: { login_url: LINK, customer_email: "kund@example.se", link_expiry_minutes: "15" },
  blocks: {},
};

const GOOD_HTML =
  `<table><tr><td><p>Hej,</p>` +
  `<p>Klicka för att logga in. Länken gäller i {{link_expiry_minutes}} minuter.</p>` +
  `<a href="{{login_url}}">Logga in</a>` +
  `<p>Skickat till {{customer_email}}</p></td></tr></table>`;

async function store(html: string, subject: string): Promise<number> {
  await db.delete(emailDesigns).where(eq(emailDesigns.locale, LOCALE));
  const [row] = await db
    .insert(emailDesigns)
    .values({
      name: "Probe inloggning",
      locale: LOCALE,
      templateKey: KEY,
      subject,
      design: { body: { rows: [] }, counters: {}, schemaVersion: 27 },
      html,
      isActive: true,
    })
    .returning({ id: emailDesigns.id });
  invalidateDesignCache();
  return row!.id;
}

async function main() {
  /* ---- no design: the built-in is used -------------------------------- */
  await db.delete(emailDesigns).where(eq(emailDesigns.locale, LOCALE));
  invalidateDesignCache();
  check("with no design, nothing resolves", (await resolveActiveDesign(KEY, LOCALE)) === null);

  /* ---- a good design ---------------------------------------------------- */
  {
    await store(GOOD_HTML, "Logga in till Turbomeck");
    const design = await resolveActiveDesign(KEY, LOCALE);
    check("a good design resolves", design !== null);

    const out = renderDesign(design!, VALUES, KEY, { required: ["login_url"] });
    check("it renders", out !== null);
    if (out) {
      /**
       * `&` inside an href must become `&amp;` — that is correct HTML and
       * browsers decode it back. What must NOT happen is `&amp;amp;`, which
       * would corrupt the token and break sign-in.
       */
      check("the link is present", out.html.includes("abc123"));
      check("ampersands are escaped once, not twice", !out.html.includes("&amp;amp;"), out.html.slice(out.html.indexOf("href"), out.html.indexOf("href") + 140));
      check("the href still carries every parameter", /href="[^"]*token=abc123[^"]*email=/.test(out.html));
      check("the expiry is filled in", out.html.includes("15 minuter"));
      check("the recipient is filled in", out.html.includes("kund@example.se"));
      check("no token survives", !out.html.includes("{{"), out.html.match(/\{\{[^}]*\}\}/g) ?? undefined);
      check("the subject comes from the design", out.subject === "Logga in till Turbomeck", out.subject);
    }
  }

  /* ---- the lockout guard ------------------------------------------------ */
  {
    await store(
      "<table><tr><td><p>Hej, logga in på webbplatsen.</p></td></tr></table>",
      "Logga in",
    );
    const design = await resolveActiveDesign(KEY, LOCALE);
    check("a design with no login link still resolves from the database", design !== null);
    check(
      "but renders as null, so the built-in template is sent",
      renderDesign(design!, VALUES, KEY, { required: ["login_url"] }) === null,
    );

    /** Without the requirement it would have rendered — proving the guard. */
    check(
      "the guard is what refuses it, not something else",
      renderDesign(design!, VALUES, KEY) !== null,
    );
  }

  /* ---- a link mentioned only in text still counts ---------------------- */
  {
    await store(
      "<table><tr><td><p>Logga in: {{login_url}}</p></td></tr></table>",
      "Logga in",
    );
    const design = await resolveActiveDesign(KEY, LOCALE);
    const out = renderDesign(design!, VALUES, KEY, { required: ["login_url"] });
    check("a link shown as text satisfies the requirement", out !== null);
    check("and the URL is intact", out?.html.includes("abc123") ?? false);
  }

  /* ---- the other fallbacks --------------------------------------------- */
  {
    const id = await store(GOOD_HTML, "Logga in");
    await db.update(emailDesigns).set({ html: "   " }).where(eq(emailDesigns.id, id));
    invalidateDesignCache();
    check("an empty body falls back", (await resolveActiveDesign(KEY, LOCALE)) === null);

    await db.update(emailDesigns).set({ html: GOOD_HTML, subject: "" }).where(eq(emailDesigns.id, id));
    invalidateDesignCache();
    const noSubject = await resolveActiveDesign(KEY, LOCALE);
    check(
      "an empty subject falls back",
      noSubject !== null && renderDesign(noSubject, VALUES, KEY, { required: ["login_url"] }) === null,
    );

    await db.delete(emailDesigns).where(eq(emailDesigns.id, id));
    invalidateDesignCache();
    check("deleting the design falls back", (await resolveActiveDesign(KEY, LOCALE)) === null);
  }

  /* ---- a design for one language is not borrowed by the other ---------- */
  {
    await store(GOOD_HTML, "Logga in");
    invalidateDesignCache();
    check("another locale is not borrowed", (await resolveActiveDesign(KEY, "zz_other")) === null);
  }

  await db.delete(emailDesigns).where(eq(emailDesigns.locale, LOCALE));
  const left = await db
    .select({ id: emailDesigns.id })
    .from(emailDesigns)
    .where(eq(emailDesigns.locale, LOCALE));
  check("cleaned up", left.length === 0);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
