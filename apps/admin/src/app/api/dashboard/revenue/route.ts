import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { monthLabelSv } from "@/lib/dashboard-month-labels";

/** GET /api/dashboard/revenue - Monthly revenue (last 6 months) for chart */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Logga in" }, { status: 401 });
  }

  try {
    const rows = await db.execute(sql`
      SELECT
        date_trunc('month', created_at) AS month,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total::numeric ELSE 0 END), 0) AS totalt,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN total::numeric ELSE 0 END), 0) AS successfull
      FROM orders
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '5 months')
      GROUP BY date_trunc('month', created_at)
      ORDER BY month ASC
    `);

    const byMonth = new Map<
      string,
      { month: string; monthLabel: string; totalt: number; successfull: number }
    >();

    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, {
        month: key,
        monthLabel: monthLabelSv(d.getMonth()),
        totalt: 0,
        successfull: 0,
      });
    }

    const rowsArray = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
    for (const row of rowsArray as { month: Date; totalt: string; successfull: string }[]) {
      const m = row.month instanceof Date ? row.month : new Date(row.month);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      const entry = byMonth.get(key);
      if (entry) {
        entry.totalt = Math.round(Number(row.totalt ?? 0));
        entry.successfull = Math.round(Number(row.successfull ?? 0));
      }
    }

    const data = Array.from(byMonth.values());
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to fetch revenue:", err);
    return NextResponse.json(
      { error: "Kunde inte hämta intäktsdata" },
      { status: 500 }
    );
  }
}
