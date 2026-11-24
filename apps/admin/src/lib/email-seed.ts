/**
 * The built-in starting point for a template that has no design yet.
 *
 * `email-designs-seed.ts` in product-service builds a sensible default for
 * every automated mail, and `/api/email-templates/seed` has served them all
 * along — but nothing in admin ever asked for one, so "Ny mall" opened a blank
 * canvas. For a mail like the admin order alert that meant rebuilding a whole
 * template by hand before it could be styled at all.
 *
 * Fetched rather than imported: the seed builders live in product-service,
 * which owns the merge-tag catalogue they write tokens from. A second copy
 * here would drift from the tokens the sender can actually fill.
 */

export type SeedTemplate = {
  templateKey: string;
  locale: string;
  name: string;
  subject: string;
  design: Record<string, unknown>;
};

function productServiceBase(): string {
  let base = (process.env.PRODUCT_SERVICE_URL || "http://localhost:8000").replace(/\/$/u, "");
  if (base.endsWith("/api")) base = base.slice(0, -4);
  return base;
}

/**
 * Returns null rather than throwing on any failure.
 *
 * A missing seed must not break the editor: the fallback is the blank canvas
 * that was the only option before, which is worse but still usable. Failing
 * the page instead would make an unreachable product-service look like a
 * broken Ny mall button.
 */
export async function fetchSeedTemplate(
  templateKey: string,
  locale: string,
): Promise<SeedTemplate | null> {
  const secret = process.env.INTERNAL_PRODUCT_API_SECRET?.trim();
  if (!secret) return null;

  try {
    const res = await fetch(`${productServiceBase()}/api/email-templates/seed`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { templates?: SeedTemplate[] };
    const templates = json.templates ?? [];
    return (
      templates.find((t) => t.templateKey === templateKey && t.locale === locale) ??
      /** A Swedish-only mail asked for in another locale still gets its design. */
      templates.find((t) => t.templateKey === templateKey) ??
      null
    );
  } catch (err) {
    console.error("[email-seed] could not fetch the default template:", err);
    return null;
  }
}
