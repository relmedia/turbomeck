import { auth } from "@repo/auth";
import { redirect } from "next/navigation";

/**
 * Admin guard for every settings page.
 *
 * This check used to sit inline in `settings/page.tsx`. Splitting that page
 * into four would have meant four copies of it, and four chances for a new
 * settings page to be added without one — a settings subtree is exactly where
 * a missing role check does the most damage. Guarding the layout covers the
 * whole subtree, including pages that do not exist yet.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (session.user.role !== "admin") redirect("/");

  return <>{children}</>;
}
