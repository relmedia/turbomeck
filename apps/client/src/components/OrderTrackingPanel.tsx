"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage, useTranslation } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { extractTrackingEvents } from "@/lib/postnord-tracking-events";

type OrderTrackingPanelProps = {
  orderId: number;
};

export default function OrderTrackingPanel({ orderId }: OrderTrackingPanelProps) {
  const { locale } = useLanguage();
  const t = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const loc = locale === "en" ? "en" : "sv";
    fetch(`/api/postnord/track?orderId=${orderId}&locale=${loc}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setData(null);
          setError(typeof body?.error === "string" ? body.error : t("orderDetail.trackingError"));
          return;
        }
        setData(body as Record<string, unknown>);
        setError(null);
      })
      .catch(() => {
        setData(null);
        setError(t("orderDetail.trackingError"));
      })
      .finally(() => setLoading(false));
  }, [orderId, locale, t]);

  useEffect(() => {
    load();
  }, [load]);

  const events = data ? extractTrackingEvents(data) : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("orderDetail.trackingTimelineTitle")}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0"
          onClick={load}
          disabled={loading}
          aria-label={t("orderDetail.trackingRefresh")}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      {loading && !data && !error && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          {t("orderDetail.trackingLoading")}
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive leading-snug">{error}</p>
      )}
      {data && !error && events.length === 0 && (
        <p className="text-xs leading-snug text-muted-foreground">{t("orderDetail.trackingNoEvents")}</p>
      )}
      {data && !error && events.length > 0 && (
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border/40 bg-muted/25 p-3">
          {events.map((ev, i) => (
            <div
              key={i}
              className="flex flex-col gap-0.5 border-b border-border/50 pb-2 last:border-0 last:pb-0"
            >
              {ev.time && (
                <span className="text-[11px] text-muted-foreground">{ev.time}</span>
              )}
              {ev.description && (
                <span className="text-xs font-medium">{ev.description}</span>
              )}
              {ev.location && (
                <span className="text-[11px] text-muted-foreground">{ev.location}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
