import { redirect } from "next/navigation";

/**
 * Settings has no landing page of its own — there is nothing useful to put on
 * one. Redirecting keeps existing bookmarks and any link to /settings working
 * now that the content lives in sub-routes.
 *
 * The admin guard lives in layout.tsx and covers this too.
 */
export default function SettingsIndexPage() {
  redirect("/settings/mail");
}
