import MailAccountSettingsForm from "@/components/MailAccountSettingsForm";

export const metadata = {
  title: "Mailinställningar",
  description: "SMTP-konfiguration för utgående e-post",
};

export default function MailSettingsPage() {
  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <h2 className="text-lg font-semibold mb-2">Mailinställningar</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Konfigurera SMTP för utskick av e-post. Utan detta skickas ingenting —
        varken orderbekräftelser, fraktmejl eller återställning av lösenord.
      </p>
      <MailAccountSettingsForm />
    </section>
  );
}
