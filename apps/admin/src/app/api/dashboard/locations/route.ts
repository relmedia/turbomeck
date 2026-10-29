import { db } from "@repo/database";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { countryFlag, countryName } from "@repo/text";

/**
 * GET /api/dashboard/locations?days=28
 *
 * Where visitors were, by country and by city, over a window.
 *
 * Counts VISITS, not people. `page_visits` holds no visitor identity at all --
 * no cookie, no hash -- so "unique visitors" is not a number this data can
 * support. One row is written per browser session (the tracker guards on
 * sessionStorage), so a visit is close to a session, and that is what the
 * labels say.
 *
 * Rows with no country are counted and returned as `unknown` rather than
 * filtered out. Every visit recorded before the geo columns existed is in that
 * bucket, and dropping it would turn "we know where 4 of 900 visits came from"
 * into a confident-looking 100%.
 */

const DEFAULT_DAYS = 28;
const ALLOWED_DAYS = [7, 28, 90, 365] as const;
const MAX_CITIES = 12;

function rowsOf(result: unknown): unknown[] {
  return Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const requested = Number(new URL(req.url).searchParams.get("days"));
  const days = (ALLOWED_DAYS as readonly number[]).includes(requested)
    ? requested
    : DEFAULT_DAYS;

  try {
    const [countryResult, cityResult] = await Promise.all([
      db.execute(sql`
        SELECT
          country,
          COUNT(*)::int AS visits,
          COUNT(DISTINCT city)::int AS cities
        FROM page_visits
        WHERE created_at >= CURRENT_DATE - ${sql.raw(String(days))} * INTERVAL '1 day'
        GROUP BY country
        ORDER BY visits DESC
      `),
      db.execute(sql`
        SELECT
          city,
          country,
          COUNT(*)::int AS visits
        FROM page_visits
        WHERE created_at >= CURRENT_DATE - ${sql.raw(String(days))} * INTERVAL '1 day'
          AND city IS NOT NULL
        GROUP BY city, country
        ORDER BY visits DESC
        LIMIT ${sql.raw(String(MAX_CITIES))}
      `),
    ]);

    const countryRows = rowsOf(countryResult) as Array<{
      country: string | null;
      visits: number;
      cities: number;
    }>;
    const cityRows = rowsOf(cityResult) as Array<{
      city: string;
      country: string | null;
      visits: number;
    }>;

    const totalVisits = countryRows.reduce((sum, r) => sum + (r.visits ?? 0), 0);
    const unknownVisits = countryRows
      .filter((r) => !r.country)
      .reduce((sum, r) => sum + (r.visits ?? 0), 0);
    const knownVisits = totalVisits - unknownVisits;

    const countries = countryRows
      .filter((r): r is { country: string; visits: number; cities: number } => Boolean(r.country))
      .map((r) => ({
        code: r.country,
        name: countryName(r.country),
        flag: countryFlag(r.country),
        visits: r.visits,
        cities: r.cities,
        /**
         * A share of the visits whose location is KNOWN, not of all visits.
         * Measured against the total it would read as a collapse every time a
         * lookup fails, which is a property of the lookup and not of the
         * traffic.
         */
        share: knownVisits > 0 ? Math.round((r.visits / knownVisits) * 1000) / 10 : 0,
      }));

    return NextResponse.json({
      days,
      totalVisits,
      knownVisits,
      unknownVisits,
      countries,
      cities: cityRows.map((r) => ({
        city: r.city,
        countryCode: r.country,
        countryName: r.country ? countryName(r.country) : null,
        flag: r.country ? countryFlag(r.country) : "",
        visits: r.visits,
      })),
    });
  } catch (err) {
    console.error("Failed to fetch visitor locations:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta besökarnas platser" },
      { status: 500 },
    );
  }
}
