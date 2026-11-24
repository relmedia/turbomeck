import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import DesignerClient from "./DesignerClient";
import { fetchSeedTemplate } from "@/lib/email-seed";
import { templateKeyLabel } from "@/lib/email-template-keys";

export const metadata = { title: "E-postdesign" };

/**
 * `ny` creates a blank design; any numeric id opens an existing one. One route
 * rather than two because the editor is identical either way — only the
 * starting document differs.
 *
 * `?from=<templateKey>` starts from that mail's built-in design instead of a
 * blank canvas, which is what makes "Skapa" on the list useful: a template
 * nobody has designed yet opens as the mail the shop already sends, ready to
 * restyle, rather than as an empty page.
 */
export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; locale?: string }>;
}) {
  const { id } = await params;

  if (id === "ny") {
    const { from, locale: wantedLocale } = await searchParams;
    const locale = wantedLocale === "en" ? "en" : "sv";
    const seed = from ? await fetchSeedTemplate(from, locale) : null;

    return (
      <DesignerClient
        initial={{
          name: seed?.name ?? (from ? templateKeyLabel(from) : "Ny mall"),
          /** The seed decides: a Swedish-only mail must not open as English. */
          locale: seed?.locale ?? locale,
          templateKey: from ?? null,
          subject: seed?.subject ?? "",
          design: seed?.design ?? null,
          html: "",
          isActive: false,
        }}
      />
    );
  }

  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric < 1) notFound();

  const [row] = await db.select().from(emailDesigns).where(eq(emailDesigns.id, numeric)).limit(1);
  if (!row) notFound();

  return (
    <DesignerClient
      initial={{
        id: row.id,
        name: row.name,
        locale: row.locale,
        templateKey: row.templateKey,
        subject: row.subject,
        design: row.design as Record<string, unknown> | null,
        html: row.html,
        isActive: row.isActive,
      }}
    />
  );
}
