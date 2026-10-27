import Link from "next/link";
import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { desc } from "drizzle-orm";
import { Button } from "@repo/ui/components/button";
import { Plus, Pencil, CheckCircle2, Circle } from "lucide-react";
import MigrateDesignsClient from "@/components/MigrateDesignsClient";

export const metadata = {
  title: "E-postdesign",
  description: "Bygg e-postmallar visuellt",
};

const KEY_LABELS: Record<string, string> = {
  order_confirmation: "Orderbekräftelse (tack för ditt köp)",
  ready_for_pickup: "Klar att hämta",
  pickup_reminder_1: "Påminnelse 1",
  pickup_reminder_2: "Påminnelse 2",
  order_delivered: "Levererad",
  core_return_reminder: "Kärnretur — påminnelse",
};

export default async function DesignListPage() {
  /** Columns only — design and html are tens of kilobytes and unused here. */
  const rows = await db
    .select({
      id: emailDesigns.id,
      name: emailDesigns.name,
      locale: emailDesigns.locale,
      templateKey: emailDesigns.templateKey,
      subject: emailDesigns.subject,
      isActive: emailDesigns.isActive,
      updatedAt: emailDesigns.updatedAt,
    })
    .from(emailDesigns)
    .orderBy(desc(emailDesigns.updatedAt));

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">E-postdesign</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bygg mallar visuellt med drag och släpp. En mall skickas först när
            den är <strong>aktiv</strong> och kopplad till ett utskick — tills
            dess används den inbyggda mallen.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <strong>Migrera standardmallar</strong> skapar redigerbara versioner
            av de inbyggda mejlen (orderbekräftelse, hämtning, påminnelser,
            levererad, kärnretur) på svenska och engelska, och aktiverar dem.
            Innehållet blir detsamma — skillnaden är att du kan ändra det här.
            Kör den igen när du vill återställa en mall till standard.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <MigrateDesignsClient />
          <Button asChild>
            <Link href="/settings/design/ny">
              <Plus className="mr-2 size-4" aria-hidden />
              Ny mall
            </Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Inga mallar än. Skapa en för att komma igång.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {d.isActive ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-label="Aktiv" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground/40" aria-label="Inaktiv" />
                  )}
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {d.locale}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {d.templateKey
                    ? `Ersätter: ${KEY_LABELS[d.templateKey] ?? d.templateKey}`
                    : "Fristående"}
                  {d.subject ? ` — ${d.subject}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/settings/design/${d.id}`}>
                  <Pencil className="mr-1.5 size-3.5" aria-hidden />
                  Redigera
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
