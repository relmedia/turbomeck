import CustomerNotificationsForm from "@/components/CustomerNotificationsForm";

export const metadata = {
  title: "Automatiska kundutskick",
  description: "Mejl som går ut till kunden automatiskt",
};

export default function CustomerNotificationSettingsPage() {
  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <h2 className="text-lg font-semibold mb-2">Automatiska kundutskick</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Mejl som går ut till kunden automatiskt när PostNord rapporterar att
        något hänt med paketet. De skickas utan att någon granskar dem först —
        här stänger du av ett utskick.
      </p>
      <CustomerNotificationsForm />
    </section>
  );
}
