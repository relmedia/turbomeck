import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const MONTH_NAMES_SV = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];

/** GET /api/dashboard/orders - Order counts per month (last 6 months) for chart */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in" }, { status: 401 });
  }

  try {
    const rows = await db.execute(sql`
      SELECT
        date_trunc('month', created_at) AS month,
        COUNT(*) FILTER (WHERE status != 'cancelled')::int AS totalt,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS slutforda,
        COUNT(*) FILTER (WHERE status != 'cancelled' AND status != 'delivered')::int AS pagang
      FROM orders
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '5 months')
      GROUP BY date_trunc('month', created_at)
      ORDER BY month ASC
    `);

    const byMonth = new Map<
      string,
      { month: string; monthLabel: string; totalt: number; slutforda: number; pagang: number }
    >();

    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, {
        month: key,
        monthLabel: MONTH_NAMES_SV[d.getMonth()] ?? "",
        totalt: 0,
        slutforda: 0,
        pagang: 0,
      });
    }

    const rowsArray = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
    for (const row of rowsArray as { month: Date; totalt: number; slutforda: number; pagang: number }[]) {
      const m = row.month instanceof Date ? row.month : new Date(row.month);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      const entry = byMonth.get(key);
      if (entry) {
        entry.totalt = row.totalt ?? 0;
        entry.slutforda = row.slutforda ?? 0;
        entry.pagang = row.pagang ?? 0;
      }
    }

    const data = Array.from(byMonth.values());
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to fetch order stats:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta orderstatistik" },
      { status: 500 }
    );
  }
}
