import Link from "next/link";
import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { asc } from "drizzle-orm";
import { Button } from "@repo/ui/components/button";
import { Plus, Pencil, CheckCircle2, Circle } from "lucide-react";
import TestSendDesignButton from "@/components/TestSendDesignButton";
import ApplyLogoClient from "@/components/ApplyLogoClient";
import DeleteDesignButton from "@/components/DeleteDesignButton";

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

/**
 * The order templates are presented in, rather than alphabetically or by edit
 * date: it is the order a customer meets them in, which is how someone
 * checking a set of mails reads down the list. Anything not listed — a
 * standalone design — sorts last.
 */
const KEY_ORDER = [
  "order_confirmation",
  "ready_for_pickup",
  "pickup_reminder_1",
  "pickup_reminder_2",
  "order_delivered",
  "core_return_reminder",
];

const LOCALE_SECTIONS: Array<{ locale: string; title: string; note: string }> = [
  { locale: "sv", title: "Svenska", note: "Skickas till kunder med svensk order" },
  { locale: "en", title: "Engelska", note: "Skickas till kunder med engelsk order" },
];

type DesignRow = {
  id: number;
  name: string;
  locale: string;
  templateKey: string | null;
  subject: string;
  isActive: boolean;
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
    .orderBy(asc(emailDesigns.name));

  const rank = (key: string | null) => {
    const i = key ? KEY_ORDER.indexOf(key) : -1;
    return i === -1 ? KEY_ORDER.length : i;
  };
  const sorted = [...rows].sort((a, b) => rank(a.templateKey) - rank(b.templateKey));

  /** Any locale someone has created beyond sv/en still gets a section. */
  const knownLocales = new Set(LOCALE_SECTIONS.map((s) => s.locale));
  const otherLocales = [...new Set(sorted.map((d) => d.locale))].filter(
    (l) => !knownLocales.has(l),
  );
  const sections = [
    ...LOCALE_SECTIONS,
    ...otherLocales.map((locale) => ({
      locale,
      title: locale.toUpperCase(),
      note: "Övrigt språk",
    })),
  ];

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">E-postdesign</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bygg mallar visuellt med drag och släpp. En mall skickas först när den är{" "}
            <strong>aktiv</strong> och kopplad till ett utskick — tills dess används den
            inbyggda mallen.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <strong>Testa</strong> skickar mallen till din egen e-post med exempeldata
            ifylld, så du ser exakt vad kunden får. Testmejl märks med{" "}
            <strong>[TEST]</strong> i ämnesraden och påverkar ingen order.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ApplyLogoClient />
          <Button asChild>
            <Link href="/settings/design/ny">
              <Plus className="mr-2 size-4" aria-hidden />
              Ny mall
            </Link>
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Inga mallar än. Skapa en för att komma igång.
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const group = sorted.filter((d) => d.locale === section.locale);
            if (group.length === 0) return null;
            return (
              <div key={section.locale}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                  <span className="text-xs text-muted-foreground">
                    {section.note} · {group.length}{" "}
                    {group.length === 1 ? "mall" : "mallar"}
                  </span>
                </div>
                <ul className="divide-y rounded-lg border">
                  {group.map((d) => (
                    <DesignListRow key={d.id} design={d} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DesignListRow({ design: d }: { design: DesignRow }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {d.isActive ? (
            <CheckCircle2
              className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500"
              aria-label="Aktiv"
            />
          ) : (
            <Circle className="size-4 shrink-0 text-muted-foreground/40" aria-label="Inaktiv" />
          )}
          <span className="truncate text-sm font-medium">{d.name}</span>
          {!d.isActive && (
            <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              Inaktiv
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {d.templateKey
            ? `Ersätter: ${KEY_LABELS[d.templateKey] ?? d.templateKey}`
            : "Fristående"}
          {d.subject ? ` — ${d.subject}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <TestSendDesignButton id={d.id} name={d.name} />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/settings/design/${d.id}`}>
            <Pencil className="mr-1.5 size-3.5" aria-hidden />
            Redigera
          </Link>
        </Button>
        <DeleteDesignButton
          id={d.id}
          name={d.name}
          locale={d.locale}
          isActive={d.isActive}
        />
      </div>
    </li>
  );
}
