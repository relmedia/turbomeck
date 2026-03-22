import { auth } from "@repo/auth";
import { redirect } from "next/navigation";
import MailAccountSettingsForm from "@/components/MailAccountSettingsForm";

export const metadata = {
  title: "Inställningar",
  description: "Applikationsinställningar",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/studio");
  }
  if (session.user.role !== "admin") {
    redirect("/studio");
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section className="rounded-xl border bg-card p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-2">Mailinställningar</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Konfigurera SMTP för utskick av e-post (t.ex. återställning av lösenord).
        </p>
        <MailAccountSettingsForm />
      </section>
    </div>
  );
}
