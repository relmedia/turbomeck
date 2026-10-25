import AdminOrderNotificationsForm from "@/components/AdminOrderNotificationsForm";

export const metadata = {
  title: "Order-notiser",
  description: "Notiser till personalen",
};

export default function OrderNotificationSettingsPage() {
  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <h2 className="text-lg font-semibold mb-2">Order-notiser</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Mejl till er själva när något händer i butiken — ny order, ny recension,
        bokad frakt. Skickas till adresserna nedan, inte till kunden.
      </p>
      <AdminOrderNotificationsForm />
    </section>
  );
}
