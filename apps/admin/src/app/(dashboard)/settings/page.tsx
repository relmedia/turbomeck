import { auth } from "@repo/auth";
import { redirect } from "next/navigation";
import AdminOrderNotificationsForm from "@/components/AdminOrderNotificationsForm";
import MailAccountSettingsForm from "@/components/MailAccountSettingsForm";

export const metadata = {
  title: "Inställningar",
  description: "Applikationsinställningar",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="rounded-xl border bg-card p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-2">Mailinställningar</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Konfigurera SMTP för utskick av e-post (t.ex. återställning av
          lösenord).
        </p>
        <MailAccountSettingsForm />
      </section>

      <section className="rounded-xl border bg-card p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-2">Order-notiser</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Få ett mejl till valda admin-adresser varje gång en kund slutför ett
          köp.
        </p>
        <AdminOrderNotificationsForm />
      </section>
    </div>
  );
}
