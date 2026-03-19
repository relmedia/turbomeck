import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const MONTH_NAMES_SV = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];

/** GET /api/dashboard/visitors - Monthly visitors by device (last 6 months) for chart */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in" }, { status: 401 });
  }

  try {
    const rows = await db.execute(sql`
      SELECT
        date_trunc('month', created_at) AS month,
        COUNT(*) FILTER (WHERE device_type = 'mobile')::int AS mobile,
        COUNT(*) FILTER (WHERE device_type = 'desktop')::int AS desktop,
        COUNT(*) FILTER (WHERE device_type = 'tablet')::int AS tablet
      FROM page_visits
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '5 months')
      GROUP BY date_trunc('month', created_at)
      ORDER BY month ASC
    `);

    const byMonth = new Map<
      string,
      { month: string; monthLabel: string; mobile: number; desktop: number; tablet: number }
    >();

    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, {
        month: key,
        monthLabel: MONTH_NAMES_SV[d.getMonth()] ?? "",
        mobile: 0,
        desktop: 0,
        tablet: 0,
      });
    }

    const rowsArray = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
    for (const row of rowsArray as { month: Date; mobile: number; desktop: number; tablet: number }[]) {
      const m = row.month instanceof Date ? row.month : new Date(row.month);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      const entry = byMonth.get(key);
      if (entry) {
        entry.mobile = row.mobile ?? 0;
        entry.desktop = row.desktop ?? 0;
        entry.tablet = row.tablet ?? 0;
      }
    }

    const data = Array.from(byMonth.values());
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to fetch visitor stats:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta besöksstatistik" },
      { status: 500 }
    );
  }
}
