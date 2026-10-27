import { db } from "@repo/database";
import { emailDesigns } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import DesignerClient from "./DesignerClient";

export const metadata = { title: "E-postdesign" };

/**
 * `ny` creates a blank design; any numeric id opens an existing one. One route
 * rather than two because the editor is identical either way — only the
 * starting document differs.
 */
export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "ny") {
    return (
      <DesignerClient
        initial={{
          name: "Ny mall",
          locale: "sv",
          templateKey: null,
          subject: "",
          design: null,
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
