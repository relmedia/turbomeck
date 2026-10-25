import {
  getPostNordBookingConfigStatus,
  type ConfigCheck,
} from "@/lib/postnord-config-status";
import { CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

export const metadata = {
  title: "Frakt & PostNord",
  description: "PostNord-konfiguration för bokning av frakt",
};

/**
 * Read-only view of the PostNord booking configuration.
 *
 * `getPostNordBookingConfigStatus()` already computed all of this; it was just
 * never visible anywhere except inside a single order, as the blocking list
 * shown when booking is unavailable. That is a poor place to discover that
 * production is missing every EDI variable — which is exactly how it was
 * found. This surfaces the same data where you would go looking for it.
 *
 * It deliberately does NOT edit anything. These values live in
 * `apps/admin/.env` on the server and are read at process start, so a form
 * here would be a lie: saving could not take effect without a restart.
 */
function CheckRow({ check }: { check: ConfigCheck }) {
  const tone = check.present
    ? "text-emerald-600 dark:text-emerald-500"
    : check.severity === "blocking"
      ? "text-destructive"
      : "text-amber-600 dark:text-amber-500";

  const Icon = check.present
    ? CheckCircle2
    : check.severity === "blocking"
      ? XCircle
      : AlertTriangle;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{check.label}</span>
          <code className="font-mono text-[11px] text-muted-foreground">{check.key}</code>
        </div>
        {check.shownValue && (
          <p className="mt-0.5 font-mono text-xs text-foreground/80 break-all">
            {check.shownValue}
          </p>
        )}
        {!check.present && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.hint}</p>
        )}
      </div>
    </li>
  );
}

export default function ShippingSettingsPage() {
  const status = getPostNordBookingConfigStatus();
  const optional = status.all.filter(
    (c) => !status.blocking.includes(c) && !status.warnings.includes(c),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-2">Frakt &amp; PostNord</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Konfigurationen som krävs för att boka frakt och skriva ut etiketter.
          Värdena sätts i <code className="font-mono text-xs">apps/admin/.env</code> på
          servern och läses när appen startar — de går inte att ändra härifrån.
        </p>

        <div
          className={`flex items-start gap-3 rounded-lg border p-3 ${
            status.ready
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          {status.ready ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          )}
          <div>
            <p className="text-sm font-medium">
              {status.ready ? "Bokning är klar att användas" : "Bokning är avstängd"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {status.ready
                ? "Alla obligatoriska värden är satta."
                : `${status.blocking.length} obligatoriskt värde saknas. Knappen "Boka frakt" är inaktiv tills de är satta.`}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Läge</dt>
            <dd className="text-sm font-medium">
              {status.mode === "test" ? "Test" : "Produktion"}
              {status.mode === "production" && (
                <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-500">
                  bokningar skapar riktiga kollin
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">API-värd</dt>
            <dd className="font-mono text-sm break-all">{status.host}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tillåtna mottagarländer</dt>
            <dd className="text-sm font-medium">{status.destinationCountries.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Testmarkering hos PostNord</dt>
            <dd className="text-sm font-medium">{status.testIndicator ? "Ja" : "Nej"}</dd>
          </div>
        </dl>

        {/* Bookings to Norway and other non-EU destinations need customs data
            that is not implemented yet. Saying so here is cheaper than a
            rejected shipment. */}
        {status.destinationCountries.some((c) => c !== "SE") && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
            <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              Mottagarländer utanför EU kräver tulluppgifter (varukod,
              ursprungsland, EORI) som ännu inte skickas med bokningen. En
              bokning dit går i väg utan tulldeklaration.
            </p>
          </div>
        )}
      </section>

      {status.blocking.length > 0 && (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Saknas — blockerar bokning</h3>
          </div>
          <ul className="divide-y">
            {status.blocking.map((c) => (
              <CheckRow key={c.key} check={c} />
            ))}
          </ul>
        </section>
      )}

      {status.warnings.length > 0 && (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Att se över</h3>
          </div>
          <ul className="divide-y">
            {status.warnings.map((c) => (
              <CheckRow key={c.key} check={c} />
            ))}
          </ul>
        </section>
      )}

      {optional.length > 0 && (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Övrigt</h3>
          </div>
          <ul className="divide-y">
            {optional.map((c) => (
              <CheckRow key={c.key} check={c} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
