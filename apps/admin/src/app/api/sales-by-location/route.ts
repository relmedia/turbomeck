import { db } from "@repo/database";
import { orders } from "@repo/database/schema";
import { sql, and, gte, lt, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

const COUNTRY_NAMES: Record<string, string> = {
  SE: "Sverige",
  NO: "Norge",
  DK: "Danmark",
  FI: "Finland",
  DE: "Tyskland",
  GB: "Storbritannien",
  US: "USA",
  NL: "Nederländerna",
  PL: "Polen",
  FR: "Frankrike",
  ES: "Spanien",
  IT: "Italien",
  AT: "Österrike",
  CH: "Schweiz",
};

/** GET /api/sales-by-location - Orders by country for last 28 days + prior 28 for change */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    const now = new Date();
    const days28Ago = new Date(now);
    days28Ago.setDate(days28Ago.getDate() - 28);
    const days56Ago = new Date(now);
    days56Ago.setDate(days56Ago.getDate() - 56);

    // Current period (last 28 days)
    const currentRows = await db
      .select({
        country: orders.country,
        total: sql<string>`SUM((${orders.total})::numeric)`,
      })
      .from(orders)
      .where(and(gte(orders.createdAt, days28Ago), ne(orders.status, "cancelled")))
      .groupBy(orders.country);

    // Prior period (28-56 days ago) for change calculation
    const priorRows = await db
      .select({
        country: orders.country,
        total: sql<string>`SUM((${orders.total})::numeric)`,
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, days56Ago),
          lt(orders.createdAt, days28Ago),
          ne(orders.status, "cancelled")
        )
      )
      .groupBy(orders.country);

    const currentByCountry = new Map(
      currentRows.map((r) => [r.country ?? "—", parseFloat(r.total ?? "0")])
    );
    const priorByCountry = new Map(
      priorRows.map((r) => [r.country ?? "—", parseFloat(r.total ?? "0")])
    );

    const totalCurrent = [...currentByCountry.values()].reduce((a, b) => a + b, 0);

    const list = [...currentByCountry.entries()]
      .filter(([, total]) => total > 0)
      .map(([country, current]) => {
        const prior = priorByCountry.get(country) ?? 0;
        let change = 0;
        if (prior > 0) {
          change = ((current - prior) / prior) * 100;
        }
        const percent = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;
        const name = COUNTRY_NAMES[country] ?? country;
        return {
          name,
          country,
          amount: current,
          change: Math.round(change * 10) / 10,
          percent: Math.round(percent * 10) / 10,
        };
      })
      .sort((a, b) => b.percent - a.percent);

    return NextResponse.json(list);
  } catch (err) {
    console.error("Failed to fetch sales by location:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta försäljning per plats" },
      { status: 500 }
    );
  }
}
