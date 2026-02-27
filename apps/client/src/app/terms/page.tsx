import Link from "next/link";

export const metadata = {
  title: "Köpvillkor | Turbomeck",
  description: "Allmänna villkor för köp hos Turbomeck.",
};

export default function VillkorPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-8">Köpvillkor</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Senast uppdaterad: februari 2025
      </p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Avtalet</h2>
          <p>
            Dessa villkor gäller för alla köp hos Turbomeck. Genom att genomföra en beställning
            godkänner du dessa villkor. Avtalet träder i kraft när vi bekräftar din beställning.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Priser och betalning</h2>
          <p>
            Alla priser är angivna i svenska kronor (SEK) inklusive moms om inget annat anges.
            Betalning sker via Stripe (kort, Klarna m.m.). Du debiteras när beställningen godkänns.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Leverans</h2>
          <p>
            Vi skickar beställningar via PostNord. Leveranstid är vanligtvis 2–5 arbetsdagar inom
            Norden, längre för utrikes leveranser. Du får spårningsinformation när försändelsen är
            på väg.
          </p>
          <p>
            Vid hemleverans eller leverans till ombud är du skyldig att vara tillgänglig eller
            hämta paketet inom angiven tid. Annars kan frakten återläggas till dig.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Ångerrätt</h2>
          <p>
            Som privatperson har du 14 dagars ångerrätt från den dag du tog emot varan. Kontakta oss
            på shopp@turbomeck.se inom denna tid. Varorna ska returneras i nyskick med originalförpackning.
          </p>
          <p>
            Vid ånger av beställning återbetalar vi betalningen inom 14 dagar efter att vi mottagit
            de returnerade varorna. Returneringskostnad betalas av kunden om inte annat gäller för
            defekta varor.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Reklamation och garanti</h2>
          <p>
            Produkter har 2 års reklamationsrätt enligt konsumentköplagen. Vid fel eller defekt,
            kontakta oss så åtgärdar vi enligt lagen. Vi förbehåller oss rätten att utreda felet
            innan ersättning eller ombyte ges.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Force majeure</h2>
          <p>
            Turbomeck ansvarar inte för förseningar eller uteblivna leveranser orsakade av omständigheter
            utanför vår kontroll (t.ex. naturkatastrofer, strejker, pandemi, transportstörningar).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Tillämplig lag och tvister</h2>
          <p>
            Svensk lag tillämpas på dessa villkor. Tvister ska i första hand lösas genom förhandling.
            Du som konsument kan också vända dig till Allmänna reklamationsnämnden (ARN).
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        <Link href="/" className="underline hover:text-foreground">
          ← Tillbaka till startsidan
        </Link>
      </p>
    </div>
  );
}
