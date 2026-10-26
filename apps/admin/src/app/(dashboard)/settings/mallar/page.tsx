import EmailTemplatesForm from "@/components/EmailTemplatesForm";

export const metadata = {
  title: "E-postmallar",
  description: "Redigera texten i de automatiska mejlen",
};

export default function EmailTemplatesPage() {
  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <h2 className="text-lg font-semibold mb-2">E-postmallar</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Texten i de automatiska mejlen. Lämna ett fält tomt så används
        standardtexten som ligger i koden — du kan alltid återställa en mall.
      </p>
      <EmailTemplatesForm />
    </section>
  );
}
