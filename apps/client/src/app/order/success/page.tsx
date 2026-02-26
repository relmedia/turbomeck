"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Package, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const POSTNORD_TRACKING_BASE = "https://www.postnord.se/vara-verktyg/spara-din-forsandelse";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const trackingId = searchParams.get("tracking");

  const trackingUrl = trackingId
    ? `${POSTNORD_TRACKING_BASE}?shipmentId=${encodeURIComponent(trackingId)}`
    : POSTNORD_TRACKING_BASE;

  return (
    <div className="w-full max-w-lg mx-auto mt-12 mb-16">
      <div className="bg-card border rounded-xl p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-6">
          <Package className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold mb-2">Tack för din beställning!</h1>
        <p className="text-muted-foreground mb-6">
          Din beställning har mottagits. Du kommer att få ett bekräftelsemail med
          orderdetaljer.
        </p>

        <div className="space-y-4">
          <Link href={trackingUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full justify-between group">
              <span className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Spåra leverans
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground">
            {trackingId ? (
              <>Din spårningslänk öppnas i ett nytt fönster.</>
            ) : (
              <>
                Länken leder till PostNords spårning. Ange ditt spårningsnummer när
                du fått det via email.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <Link href="/account" className="flex-1">
            <Button variant="outline" className="w-full">
              Mitt konto
            </Button>
          </Link>
          <Link href="/products" className="flex-1">
            <Button className="w-full">Fortsätt handla</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-lg mx-auto mt-12 mb-16 text-center text-muted-foreground">Laddar...</div>}>
      <OrderSuccessContent />
    </Suspense>
  );
}
