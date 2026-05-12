import { db } from "@repo/database";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/** GET /api/dashboard/browsers - Browser usage breakdown (last 6 months) for pie chart */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(browser, 'other') AS browser,
        COUNT(*)::int AS visitors
      FROM page_visits
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '5 months')
      GROUP BY COALESCE(browser, 'other')
    `);

    const rowsArray = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
    const byBrowser = new Map<string, number>([
      ["chrome", 0],
      ["safari", 0],
      ["firefox", 0],
      ["edge", 0],
      ["other", 0],
    ]);

    for (const row of rowsArray as { browser: string; visitors: number }[]) {
      const b = String(row.browser ?? "other").toLowerCase();
      const key = ["chrome", "safari", "firefox", "edge"].includes(b) ? b : "other";
      byBrowser.set(key, (byBrowser.get(key) ?? 0) + (row.visitors ?? 0));
    }

    const totalThisMonth = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM page_visits
      WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
    `);
    const totalLastMonth = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM page_visits
      WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
    `);

    const thisMonth =
      (Array.isArray(totalThisMonth) ? totalThisMonth[0] : (totalThisMonth as { rows?: unknown[] }).rows?.[0]) as
        | { c: number }
        | undefined;
    const lastMonth =
      (Array.isArray(totalLastMonth) ? totalLastMonth[0] : (totalLastMonth as { rows?: unknown[] }).rows?.[0]) as
        | { c: number }
        | undefined;

    const thisCount = thisMonth?.c ?? 0;
    const lastCount = lastMonth?.c ?? 0;
    const change =
      lastCount > 0 ? Math.round(((thisCount - lastCount) / lastCount) * 1000) / 10 : thisCount > 0 ? 100 : 0;

    const data = Array.from(byBrowser.entries())
      .filter(([, v]) => v > 0)
      .map(([browser, visitors]) => ({ browser, visitors }));

    return NextResponse.json({
      data: data.sort((a, b) => b.visitors - a.visitors),
      total: Array.from(byBrowser.values()).reduce((s, v) => s + v, 0),
      change,
    });
  } catch (err) {
    console.error("Failed to fetch browser stats:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta webbläsarstatistik" },
      { status: 500 }
    );
  }
}
