import Link from "next/link";

export const metadata = {
  title: "Integritetspolicy | Turbomeck",
  description: "Så hanterar Turbomeck dina personuppgifter i enlighet med GDPR.",
};

export default function IntegritetspolicyPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-8">Integritetspolicy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Senast uppdaterad: februari 2025
      </p>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Personuppgiftsansvarig</h2>
          <p>
            Turbomeck är personuppgiftsansvarig för de personuppgifter som vi samlar in och
            behandlar. Du når oss via shopp@turbomeck.se eller på adressen nedan.
          </p>
          <p>
            Turbomeck
            <br />
            Husholmsgatan 4
            <br />
            425 30 Hisings Kärra
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Vilka uppgifter samlar vi in?</h2>
          <p>Vi samlar in följande typer av uppgifter när du handlar eller skapar ett konto:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Kontaktuppgifter: namn, e-postadress, telefonnummer</li>
            <li>Leveransadress: adress, postnummer, stad och land</li>
            <li>Betalningsinformation: behandlas säkert genom Stripe (vi lagrar inte kortuppgifter)</li>
            <li>Orderhistorik: produkter, priser och leveransstatus</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Syfte med behandlingen</h2>
          <p>Vi använder dina uppgifter för att:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Fulföra och leverera dina beställningar</li>
            <li>Kommuncera med dig kring leverans och support</li>
            <li>Hantera betalningar säkert</li>
            <li>Uppfylla lagkrav (t.ex. bokföring)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Rättslig grund</h2>
          <p>
            Behandlingen grundas på avtalsuppfyllelse (för beställningar) samt vårt berättigade
            intresse att bedriva e-handel och ge kundservice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Lagring och delning</h2>
          <p>
            Vi lagrar dina uppgifter så länge det krävs för att fullgöra beställningar och uppfylla
            bokföringslagen (7 år). Betalningsdata hanteras av Stripe enligt deras integritetspolicy.
          </p>
          <p className="font-medium mt-4">Underleverantörer (personuppgiftsbiträden):</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Stripe</strong> — betalningshantering (USA/EU, DPA)</li>
            <li><strong>PostNord</strong> — frakt och spårning (Sverige/Norden)</li>
            <li><strong>Google/Facebook</strong> — endast vid inloggning via sociala nätverk (OAuth)</li>
            <li>Behöriga myndigheter vid lagstadgat krav</li>
          </ul>
          <p className="mt-2">
            Alla underleverantörer har avtal som säkerställer skyddet av dina personuppgifter.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Dina rättigheter</h2>
          <p>Enligt GDPR har du rätt till:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Åtkomst till dina personuppgifter</li>
            <li>Rättelse av felaktiga uppgifter</li>
            <li>Rätten att bli glömd (radering, inom vissa undantag)</li>
            <li>Dataportabilitet — ladda ner en kopia av dina uppgifter i{" "}
              <Link href="/account/export" className="underline hover:text-foreground">PDF-format</Link>
            </li>
            <li>Invända mot viss behandling</li>
          </ul>
          <p>Kontakta oss på shopp@turbomeck.se för att utöva dina rättigheter.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Cookies</h2>
          <p>
            Vi använder nödvändiga cookies för att webbplatsen ska fungera (t.ex. varukorg och
            inloggning). Inga spårningscookies för marknadsföring används utan ditt samtycke.
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
