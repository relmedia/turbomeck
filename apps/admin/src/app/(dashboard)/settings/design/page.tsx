import Link from "next/link";
import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { asc } from "drizzle-orm";
import { Button } from "@repo/ui/components/button";
import { Plus, Pencil, CheckCircle2, Circle } from "lucide-react";
import TestSendDesignButton from "@/components/TestSendDesignButton";
import ApplyLogoClient from "@/components/ApplyLogoClient";
import DeleteDesignButton from "@/components/DeleteDesignButton";
import {
  EMAIL_TEMPLATE_KEYS,
  templateKeyLabel,
  templateKeyRank,
  isAdminTemplateKey,
} from "@/lib/email-template-keys";

export const metadata = {
  title: "E-postdesign",
  description: "Bygg e-postmallar visuellt",
};

const LOCALE_SECTIONS: Array<{ locale: string; title: string; note: string }> = [
  { locale: "sv", title: "Svenska", note: "Svensk order" },
  { locale: "en", title: "Engelska", note: "Engelsk order" },
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

  const sorted = [...rows].sort(
    (a, b) => templateKeyRank(a.templateKey) - templateKeyRank(b.templateKey),
  );

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
                  {EMAIL_TEMPLATE_KEYS.filter(
                    (t) =>
                      t.locales.includes(section.locale) &&
                      !group.some((d) => d.templateKey === t.key),
                  ).map((t) => (
                    <MissingTemplateRow key={t.key} templateKey={t.key} locale={section.locale} />
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

/**
 * A mail that has no design yet.
 *
 * Listed rather than simply absent: "we do not have the admin order mail" was
 * a real report, and the only way to notice was knowing the full set by heart.
 * A greyed row says the mail exists, is currently sent from the built-in
 * template, and can be designed in one click.
 */
function MissingTemplateRow({
  templateKey,
  locale,
}: {
  templateKey: string;
  locale: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Circle className="size-4 shrink-0 text-muted-foreground/40" aria-hidden />
          <span className="truncate text-sm text-muted-foreground">
            {templateKeyLabel(templateKey)}
          </span>
          {isAdminTemplateKey(templateKey) && (
            <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              Till admin
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Ingen mall — använder den inbyggda
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/settings/design/ny?from=${templateKey}&locale=${locale}`}>
          <Plus className="mr-1.5 size-3.5" aria-hidden />
          Skapa
        </Link>
      </Button>
    </li>
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
          {isAdminTemplateKey(d.templateKey) && (
            /**
             * The Svenska section otherwise reads as "mails customers get".
             * This one goes to the shop, and activating it by mistake while
             * thinking it was the customer receipt would be a bad surprise.
             */
            <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              Till admin
            </span>
          )}
          {!d.isActive && (
            <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              Inaktiv
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {d.templateKey
            ? `Ersätter: ${templateKeyLabel(d.templateKey)}`
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
