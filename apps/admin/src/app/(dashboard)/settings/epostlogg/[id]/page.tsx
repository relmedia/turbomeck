"use client";

/**
 * One archived email, exactly as the customer received it.
 *
 * Shows the stored copy rather than re-rendering the template, which is the
 * whole point: the template is editable in E-postdesign afterwards and the
 * order changes too, so a re-render would show what we WOULD send today. For
 * a log that is the one thing it must not be.
 *
 * The body goes in a sandboxed iframe with `srcDoc`. Two reasons, both real:
 * an email carries its own full-document CSS that would otherwise bleed into
 * the admin UI, and sandboxing means nothing in a stored body can execute
 * against the admin origin. `sandbox=""` with no allow-tokens blocks scripts,
 * forms and navigation while still rendering styles and images.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { ORDER_EMAIL_STATE_META, type OrderEmailState } from "@/lib/order-email-state";

type Archived = {
  id: number;
  orderId: number;
  orderNumber: string | null;
  kind: string;
  label: string;
  state: OrderEmailState;
  subject: string | null;
  sentAt: string | null;
  recipient: string | null;
  html: string | null;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ArchivedEmailPage() {
  const params = useParams<{ id: string }>();
  const [mail, setMail] = useState<Archived | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/order-emails/${params.id}/html`, { cache: "no-store" });
        const json = (await res.json()) as Archived & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setMail(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Kunde inte hämta mejlet");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const stateMeta = mail ? ORDER_EMAIL_STATE_META[mail.state] : null;

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/settings/epostlogg">
              <ArrowLeft className="mr-1.5 size-3.5" aria-hidden />
              Tillbaka till loggen
            </Link>
          </Button>
          {mail && (
            <>
              <h2 className="text-lg font-semibold">{mail.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mail.subject ? (
                  <>
                    Ämne: <span className="text-foreground">{mail.subject}</span>
                  </>
                ) : (
                  "Ämnesraden sparades inte för det här utskicket."
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {mail.recipient ? `Till ${mail.recipient} · ` : ""}
                {formatDateTime(mail.sentAt)}
              </p>
            </>
          )}
        </div>
        {mail && (
          <div className="flex items-center gap-2">
            {stateMeta && (
              <span
                className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${stateMeta.className}`}
                title={stateMeta.hint}
              >
                {stateMeta.label}
              </span>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/payments/${mail.orderId}`}>
                {mail.orderNumber ?? `#${mail.orderId}`}
                <ExternalLink className="ml-1.5 size-3" aria-hidden />
              </Link>
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
          Hämtar mejlet…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-dashed px-4 py-16 text-center text-sm text-destructive">
          {error}
        </div>
      ) : !mail?.html ? (
        /*
          No body. The two reasons are different enough that guessing between
          them would mislead, so the state decides which is said.
        */
        <div className="rounded-lg border border-dashed px-4 py-14 text-center">
          <p className="text-sm font-medium">Ingen sparad kopia</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {mail?.state === "superseded"
              ? "Det här utskicket bockades av utan att något mejl skickades — paketet hade redan gått vidare. Det finns därför inget mejl att visa."
              : mail?.state === "backfilled"
                ? "Raden lades in när loggen skapades och motsvarar inget registrerat utskick, så det finns ingen kopia."
                : mail?.state === "sent"
                  ? "Mejlet skickades innan kopior började sparas. Innehållet finns inte kvar någonstans — nya utskick arkiveras automatiskt."
                  : "Mejlet har inte skickats, så det finns ingen kopia att visa."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          {/*
            `sandbox=""` deliberately grants nothing: styles and images render,
            scripts and navigation do not. `srcDoc` keeps the body out of any
            URL, so it is never served from the admin origin.
          */}
          <iframe
            title={`Mejl: ${mail.label}`}
            srcDoc={mail.html}
            sandbox=""
            referrerPolicy="no-referrer"
            className="h-[75vh] w-full border-0 bg-white"
          />
        </div>
      )}
    </section>
  );
}
