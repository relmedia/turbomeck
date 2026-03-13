import Link from "next/link";

export const metadata = {
  title: "Köpvillkor | Turbomeck",
  description: "Allmänna villkor för köp hos Turbomeck.",
};

export default function VillkorPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 px-4 py-2 mb-8 text-sm font-medium bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        ← Tillbaka till startsidan
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        Köpvillkor
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
        Läs gärna igenom köpvillkoren för Turbomeck. Vid frågor, kontakta oss på{" "}
        <a href="mailto:shopp@turbomeck.se" className="underline hover:text-foreground">
          shopp@turbomeck.se
        </a>.
      </p>

      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-8">
        Senast uppdaterad: mars 2025
      </h2>

      <div className="space-y-8 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">1. Avtalet</h2>
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
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">3. Utbyte och deposition (utbytesprodukter)</h2>
          <p>
            Vissa produkter (utbytesprodukter) kräver inlämning av din gamla del (kärna/kärnparti).
            Dessa beställningar har särskild betalningsordning enligt nedan. Deposition gäller endast för
            kunder bosatta i Sverige (bestäms automatiskt utifrån din plats).
          </p>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-4 mb-2">Så fungerar det</h3>
          <ol className="list-decimal list-inside space-y-1 mb-2">
            <li>Du betalar en deposition (förskottsbelopp) vid köp.</li>
            <li>Du skickar in din gamla del till oss enligt instruktionerna i orderbekräftelsen.</li>
            <li>När vi mottagit och registrerat din gamla del skickar vi den nya produkten till dig.</li>
            <li>Du betalar restbeloppet via den länk vi skickar till dig (betalning innan leverans).</li>
          </ol>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-4 mb-2">Dina rättigheter</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Du har rätt till att få depositionen återbetald om du avbryter beställningen innan du
              skickat in den gamla delen, inom 14 dagar från köpet (ångerrätt).
            </li>
            <li>
              Du har rätt till att få den nya produkten levererad när vi mottagit din gamla del och
              du betalat restbeloppet. Vi skickar betalningslänk så snart din del är mottagen.
            </li>
            <li>
              Om du inte skickar in den gamla delen inom rimlig tid (normalt 30 dagar) förbehåller vi
              oss rätten att behålla depositionen och avbryta utbytet. Kontakta oss om du behöver
              förlängd tid.
            </li>
            <li>
              Den gamla delen ska vara den del som avses för produkten (korrekt typ/kärna). Vid
              felaktig eller ofullständig inlämning kan utbytet nekas och deposition behållas.
            </li>
          </ul>
          <p className="mt-2">
            Vid frågor om utbyte eller deposition, kontakta oss på shopp@turbomeck.se.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">4. Leverans</h2>
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
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">5. Ångerrätt</h2>
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
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">7. Force majeure</h2>
          <p>
            Turbomeck ansvarar inte för förseningar eller uteblivna leveranser orsakade av omständigheter
            utanför vår kontroll (t.ex. naturkatastrofer, strejker, pandemi, transportstörningar).
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">8. Tillämplig lag och tvister</h2>
          <p>
            Svensk lag tillämpas på dessa villkor. Tvister ska i första hand lösas genom förhandling.
            Du som konsument kan också vända dig till Allmänna reklamationsnämnden (ARN).
          </p>
        </section>
      </div>
    </div>
  );
}
