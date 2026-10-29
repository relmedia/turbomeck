/**
 * Checks visitor geolocation and the dashboard's aggregation of it.
 *
 * Three claims here are worth proving rather than assuming:
 *
 *  1. **A private address is never sent to a third party.** Every request in
 *     local development comes from 127.0.0.1 or a 192.168.x peer. If those
 *     reached ipwho.is it would be both useless and a quiet outbound call per
 *     page view, so the guard is asserted by counting fetches, not by reading
 *     the code.
 *  2. **A lookup failure costs nothing.** The visit row matters more than the
 *     country on it; a thrown error there would lose the visit entirely.
 *  3. **The unknown bucket is counted, not dropped.** Every visit recorded
 *     before the geo columns existed has no country. A query that filtered
 *     them out would report a confident 100% from a handful of rows.
 *
 * Makes ONE real call to ipwho.is, for a public address that is not a
 * visitor's (8.8.8.8), to prove the provider and the field list still work.
 *
 * Writes only its own rows, marked with a path nothing else uses, and deletes
 * them again.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/client/tsconfig.json --env-file=apps/client/.env \
 *     apps/client/src/lib/__verify-visitor-geo.ts
 */

import { db } from "@repo/database";
import { pageVisits } from "@repo/database/schema";
import { sql } from "drizzle-orm";
import { countryFlag, countryName } from "@repo/text";
import { resolveVisitorGeo, __clearVisitorGeoCache } from "./visitor-geo";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const MARKER = "/__verify-visitor-geo";

/** Counts outbound calls so "no lookup happened" is an assertion, not a hope. */
const realFetch = globalThis.fetch;
let fetchCount = 0;
let fetchStub: ((url: string) => Promise<Response>) | null = null;

globalThis.fetch = (async (input: unknown, init?: unknown) => {
  fetchCount++;
  const url = String(input);
  if (fetchStub) return fetchStub(url);
  return realFetch(input as string, init as RequestInit);
}) as typeof fetch;

const headersWith = (entries: Record<string, string>) => new Headers(entries);

async function main() {
  /* ---- a private or missing address never leaves the machine ----------- */
  {
    const unroutable = [
      "127.0.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "10.0.0.5",
      "192.168.1.14",
      "172.16.9.1",
      "172.31.255.255",
      "169.254.1.1",
      "fe80::1",
      "fd00::1",
      "unknown",
    ];
    __clearVisitorGeoCache();
    const before = fetchCount;
    const results: Array<[string, string | null]> = [];
    for (const ip of unroutable) {
      const geo = await resolveVisitorGeo(headersWith({ "x-real-ip": ip }));
      results.push([ip, geo.country]);
    }
    check(
      "no lookup is made for a loopback, link-local or private address",
      fetchCount === before,
      { calls: fetchCount - before },
    );
    check(
      "and each returns an unknown location",
      results.every(([, c]) => c === null),
      results.filter(([, c]) => c !== null),
    );

    /** 172.32 is public; the private range stops at 172.31. */
    __clearVisitorGeoCache();
    fetchStub = async () =>
      new Response(JSON.stringify({ success: true, country_code: "SE" }), {
        headers: { "content-type": "application/json" },
      });
    const edgeOfRange = await resolveVisitorGeo(headersWith({ "x-real-ip": "172.32.0.1" }));
    check("172.32.x is treated as public, not private", edgeOfRange.country === "SE", edgeOfRange);
    fetchStub = null;
  }

  /* ---- the edge header wins, and costs nothing ------------------------- */
  {
    __clearVisitorGeoCache();
    const before = fetchCount;
    const geo = await resolveVisitorGeo(
      headersWith({ "cf-ipcountry": "se", "x-real-ip": "8.8.8.8" }),
    );
    check("an edge country header is used as-is, uppercased", geo.country === "SE", geo);
    check("and no lookup is made when the edge already knows", fetchCount === before);

    /** Providers send XX for "we do not know"; it must not be stored as data. */
    __clearVisitorGeoCache();
    fetchStub = async () => new Response(JSON.stringify({ success: false }));
    const xx = await resolveVisitorGeo(headersWith({ "cf-ipcountry": "XX", "x-real-ip": "8.8.8.8" }));
    check("XX is rejected rather than stored as a country", xx.country === null, xx);
    fetchStub = null;

    /** Vercel percent-encodes city names to keep the header ASCII. */
    __clearVisitorGeoCache();
    const encoded = await resolveVisitorGeo(
      headersWith({ "x-vercel-ip-country": "SE", "x-vercel-ip-city": "Malm%C3%B6" }),
    );
    check("a percent-encoded city header is decoded", encoded.city === "Malmö", encoded);
  }

  /* ---- a failing provider never throws -------------------------------- */
  {
    for (const [label, stub] of [
      ["a network error", async () => { throw new Error("ECONNRESET"); }],
      ["a timeout", async () => { throw new DOMException("TimeoutError", "TimeoutError"); }],
      ["a 429 rate limit", async () => new Response("slow down", { status: 429 })],
      ["success:false", async () => new Response(JSON.stringify({ success: false }))],
      ["unparseable json", async () => new Response("<html>502</html>")],
      ["a missing country_code", async () => new Response(JSON.stringify({ success: true }))],
    ] as Array<[string, () => Promise<Response>]>) {
      __clearVisitorGeoCache();
      fetchStub = stub;
      let threw = false;
      let geo = { country: "unset" } as unknown as Awaited<ReturnType<typeof resolveVisitorGeo>>;
      try {
        geo = await resolveVisitorGeo(headersWith({ "x-real-ip": "8.8.8.8" }));
      } catch {
        threw = true;
      }
      check(`${label} yields an unknown location instead of throwing`, !threw && geo.country === null, geo);
    }
    fetchStub = null;
  }

  /* ---- the kill switch ------------------------------------------------- */
  {
    __clearVisitorGeoCache();
    const prev = process.env.GEOIP_LOOKUP;
    process.env.GEOIP_LOOKUP = "off";
    const before = fetchCount;
    const geo = await resolveVisitorGeo(headersWith({ "x-real-ip": "8.8.8.8" }));
    check("GEOIP_LOOKUP=off makes no call at all", fetchCount === before && geo.country === null, geo);
    if (prev === undefined) delete process.env.GEOIP_LOOKUP;
    else process.env.GEOIP_LOOKUP = prev;
  }

  /* ---- one real call, to prove the provider still answers -------------- */
  {
    __clearVisitorGeoCache();
    const before = fetchCount;
    const geo = await resolveVisitorGeo(headersWith({ "x-real-ip": "8.8.8.8" }));
    check("a real public address resolves to a country", geo.country === "US", geo);
    check("and it took exactly one call", fetchCount - before === 1, fetchCount - before);

    /** The cache is what keeps a busy day inside a free quota. */
    const afterFirst = fetchCount;
    const again = await resolveVisitorGeo(headersWith({ "x-real-ip": "8.8.8.8" }));
    check(
      "a repeat visit from the same address is served from cache",
      fetchCount === afterFirst && again.country === geo.country,
      { calls: fetchCount - afterFirst },
    );

    /** A different address must not read the first one's entry. */
    fetchStub = async (url) => {
      check("the looked-up address is the one in the header", url.includes("1.1.1.1"), url);
      return new Response(JSON.stringify({ success: true, country_code: "AU", city: "Sydney" }));
    };
    const other = await resolveVisitorGeo(headersWith({ "x-real-ip": "1.1.1.1" }));
    check("a different address is looked up separately", other.country === "AU", other);
    fetchStub = null;
  }

  /* ---- a spoofed x-forwarded-for cannot choose the country ------------- */
  {
    __clearVisitorGeoCache();
    fetchStub = async (url) => {
      check(
        "a client-supplied forwarded hop is ignored in favour of the real peer",
        url.includes("8.8.8.8") && !url.includes("203.0.113.9"),
        url,
      );
      return new Response(JSON.stringify({ success: true, country_code: "US" }));
    };
    await resolveVisitorGeo(
      headersWith({ "x-forwarded-for": "203.0.113.9, 8.8.8.8", "x-real-ip": "8.8.8.8" }),
    );
    fetchStub = null;
  }

  /* ---- the dashboard's aggregation ------------------------------------- */
  {
    /** Known counts, including rows with no country at all. */
    const fixtures: Array<{ country: string | null; city: string | null }> = [
      { country: "SE", city: "Stockholm" },
      { country: "SE", city: "Stockholm" },
      { country: "SE", city: "Göteborg" },
      { country: "NO", city: "Oslo" },
      { country: null, city: null },
      { country: null, city: null },
      { country: null, city: null },
    ];
    await db.insert(pageVisits).values(
      fixtures.map((f) => ({
        deviceType: "desktop",
        browser: "chrome",
        path: MARKER,
        country: f.country,
        region: null,
        city: f.city,
      })),
    );

    try {
      /** Exactly the route's query, narrowed to this harness's own rows. */
      const result = await db.execute(sql`
        SELECT country, COUNT(*)::int AS visits, COUNT(DISTINCT city)::int AS cities
        FROM page_visits
        WHERE created_at >= CURRENT_DATE - 28 * INTERVAL '1 day'
          AND path = ${MARKER}
        GROUP BY country
        ORDER BY visits DESC
      `);
      const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as
        Array<{ country: string | null; visits: number; cities: number }>;

      const byCountry = new Map(rows.map((r) => [r.country ?? "__null", r]));
      check("Sweden's visits are counted", byCountry.get("SE")?.visits === 3, byCountry.get("SE"));
      check("its distinct cities are counted", byCountry.get("SE")?.cities === 2, byCountry.get("SE"));
      check("Norway is a separate row", byCountry.get("NO")?.visits === 1, byCountry.get("NO"));

      /** The claim that matters: null rows are present, not filtered away. */
      check(
        "visits with no country come back as their own bucket",
        byCountry.get("__null")?.visits === 3,
        byCountry.get("__null"),
      );

      const total = rows.reduce((s, r) => s + r.visits, 0);
      const unknown = rows.filter((r) => !r.country).reduce((s, r) => s + r.visits, 0);
      check("every inserted visit is accounted for", total === fixtures.length, { total });

      /**
       * Share is of KNOWN visits. Against the total, Sweden would read as 43%
       * here purely because three lookups failed — a property of the provider,
       * not of the traffic.
       */
      const known = total - unknown;
      const seShare = Math.round(((byCountry.get("SE")?.visits ?? 0) / known) * 1000) / 10;
      check("a country's share is measured against located visits", seShare === 75, { seShare, known });

      /** The date filter must be inclusive of rows written seconds ago. */
      check("rows written now fall inside the 28-day window", known === 4, { known });

      /** The city query skips the null-city rows rather than grouping them. */
      const cityResult = await db.execute(sql`
        SELECT city, country, COUNT(*)::int AS visits
        FROM page_visits
        WHERE created_at >= CURRENT_DATE - 28 * INTERVAL '1 day'
          AND path = ${MARKER}
          AND city IS NOT NULL
        GROUP BY city, country
        ORDER BY visits DESC
        LIMIT 12
      `);
      const cityRows = (Array.isArray(cityResult) ? cityResult : (cityResult as { rows?: unknown[] }).rows ?? []) as
        Array<{ city: string; visits: number }>;
      check("the busiest city leads the city list", cityRows[0]?.city === "Stockholm", cityRows[0]);
      check("a city with no location is not listed", cityRows.length === 3, cityRows.length);
      check(
        "a non-ASCII city name survives the round trip",
        cityRows.some((r) => r.city === "Göteborg"),
        cityRows.map((r) => r.city),
      );
    } finally {
      const deleted = await db.delete(pageVisits).where(sql`path = ${MARKER}`).returning({ id: pageVisits.id });
      check("harness rows cleaned up", deleted.length === fixtures.length, { removed: deleted.length });
    }
  }

  /* ---- the flag and name helpers the card renders ---------------------- */
  {
    check("SE renders the Swedish flag", countryFlag("SE") === "🇸🇪", countryFlag("SE"));
    check("NO renders the Norwegian flag", countryFlag("NO") === "🇳🇴", countryFlag("NO"));
    check(
      "an invalid code renders no flag rather than stray letters",
      countryFlag("Q") === "" && countryFlag("") === "",
      countryFlag("Q"),
    );

    check("country names are Swedish", countryName("DE") === "Tyskland", countryName("DE"));
    check("a lowercase code still resolves", countryName("se") === "Sverige", countryName("se"));

    /**
     * The one CLDR special case, and the reason countryName exists at all.
     * `Intl.DisplayNames.of("ZZ")` answers "okänd region" — which, sitting in
     * a list of countries, is indistinguishable from the bucket of visits
     * whose location could not be determined. Two unknowns sharing one label
     * is worse than showing the raw code.
     */
    check("ZZ shows as its code, not as the unknown bucket's wording", countryName("ZZ") === "ZZ", countryName("ZZ"));
    check("an unassigned code falls back to itself", countryName("QQ") === "QQ", countryName("QQ"));
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
