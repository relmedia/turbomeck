"use client";

import type { ReactNode } from "react";
import type { Order } from "@/lib/api";
import { resolveImageUrl } from "@/lib/api";
import { useLanguage, useTranslation } from "@/i18n/context";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import OrderTrackingPanel from "@/components/OrderTrackingPanel";
import { Button } from "@/components/ui/button";
import { cn, normalizeShopOrderNumber } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  X,
  ExternalLink,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Calendar,
  MapPin,
  ShoppingBag,
  Receipt,
  Route,
  Info,
} from "lucide-react";

const POSTNORD_TRACKING_BASE =
  "https://www.postnord.se/vara-verktyg/spara-din-forsandelse";

type OrderDetailModalProps = {
  order: Order | null;
  onClose: () => void;
};

function DetailSection({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/60 bg-linear-to-b from-muted/25 to-muted/5 px-4 py-4 shadow-sm",
        className,
      )}
    >
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  const { locale } = useLanguage();
  const t = useTranslation();

  if (!order) return null;

  const statusLabel =
    order.status === "confirmed"
      ? t("orderDetail.orderStatusConfirmed")
      : order.status === "shipped"
        ? t("orderDetail.orderStatusShipped")
        : order.status === "delivered"
          ? t("orderDetail.orderStatusDelivered")
          : order.status === "cancelled"
            ? t("orderDetail.orderStatusCancelled")
            : order.status;

  const statusBadge =
    order.status === "confirmed"
      ? {
          Icon: Package,
          className:
            "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200",
        }
      : order.status === "shipped"
        ? {
            Icon: Truck,
            className: "border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-200",
          }
        : order.status === "delivered"
          ? {
              Icon: CheckCircle2,
              className:
                "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
            }
          : order.status === "cancelled"
            ? {
                Icon: XCircle,
                className:
                  "border-destructive/30 bg-destructive/10 text-destructive dark:text-red-300",
              }
            : {
                Icon: Package,
                className: "border-border bg-muted/60 text-foreground",
              };

  const numberLocale = locale === "en" ? "en-GB" : "sv-SE";
  const displayRef = normalizeShopOrderNumber(order.orderNumber);

  const trackingUrl = order.postNordTrackingId
    ? `${POSTNORD_TRACKING_BASE}?shipmentId=${encodeURIComponent(order.postNordTrackingId)}`
    : null;

  const StatusIcon = statusBadge.Icon;

  const showShipmentSection =
    Boolean(trackingUrl) ||
    (order.status !== "cancelled" &&
      (order.status === "confirmed" ||
        order.status === "shipped" ||
        order.status === "delivered"));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] dark:bg-black/55" />
      <div
        className="relative flex max-h-[min(90vh,880px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-background shadow-2xl shadow-black/20 ring-1 ring-black/5 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-border/60 bg-muted/30 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-9 w-9 rounded-full text-muted-foreground hover:bg-background/80 hover:text-foreground"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </Button>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("orderDetail.orderTitle")}
          </p>
          <h2
            id="order-detail-title"
            className="mt-1 pr-10 text-2xl font-semibold tracking-tight text-foreground"
          >
            #{displayRef}
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                statusBadge.className,
              )}
            >
              <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {statusLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              {new Date(order.createdAt).toLocaleDateString(
                locale === "en" ? "en-GB" : "sv-SE",
                {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                },
              )}
            </span>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
          {showShipmentSection && (
            <DetailSection title={t("orderDetail.sectionShipment")} icon={Route}>
              {trackingUrl ? (
                <div className="space-y-3">
                  <Button variant="default" size="sm" className="w-full sm:w-auto" asChild>
                    <a href={trackingUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      {t("orderDetail.trackDelivery")}
                    </a>
                  </Button>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("orderDetail.trackingStatusHint")}
                  </p>
                  <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                    <OrderTrackingPanel orderId={order.id} />
                  </div>
                </div>
              ) : order.status === "confirmed" ? (
                <p className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/80" aria-hidden />
                  <span>{t("orderDetail.trackingWhenShipped")}</span>
                </p>
              ) : (order.status === "shipped" || order.status === "delivered") &&
                !order.postNordTrackingId ? (
                <p className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/80" aria-hidden />
                  <span>{t("orderDetail.trackingPendingAdmin")}</span>
                </p>
              ) : null}
            </DetailSection>
          )}

          <DetailSection title={t("orderDetail.deliveryAddress")} icon={MapPin}>
            <div className="space-y-1.5 text-sm leading-relaxed">
              <p className="font-medium text-foreground">
                {order.firstName} {order.lastName}
              </p>
              <p className="text-muted-foreground">
                {order.address}
                <br />
                {order.postalCode} {order.city}, {order.country}
              </p>
              {order.servicePointName && (
                <p className="pt-1 text-muted-foreground">
                  <span className="font-medium text-foreground/90">
                    {t("orderDetail.servicePoint")}
                  </span>
                  {": "}
                  {order.servicePointName}
                </p>
              )}
            </div>
          </DetailSection>

          <DetailSection title={t("orderDetail.products")} icon={ShoppingBag}>
            {(order.items?.length ?? 0) > 0 ? (
              <ul className="space-y-3">
                {order.items!.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-3 rounded-lg border border-border/40 bg-background/50 p-3 transition-colors hover:bg-muted/15"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border/30 bg-muted shadow-inner">
                      <ImageWithFallback
                        src={resolveImageUrl(item.productImage)}
                        alt={item.productName || t("orderDetail.product")}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
                        {item.productName ||
                          `${t("orderDetail.product")} #${item.productId ?? item.id}`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.quantity} × {Number(item.price).toLocaleString(numberLocale)}{" "}
                        {t("common.kr")}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {(Number(item.price) * item.quantity).toLocaleString(numberLocale)}{" "}
                      {t("common.kr")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("orderDetail.noProductDetails")}</p>
            )}
          </DetailSection>

          <section className="rounded-xl border border-border/60 bg-muted/40 px-4 py-4">
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <Receipt className="h-3.5 w-3.5 opacity-80" aria-hidden />
              {t("orderDetail.sectionSummary")}
            </h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("orderDetail.subtotal")}</dt>
                <dd className="tabular-nums font-medium text-foreground">
                  {order.subtotal.toLocaleString(numberLocale)} {t("common.kr")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("orderDetail.shipping")}</dt>
                <dd className="tabular-nums text-foreground">
                  {order.shippingCost.toLocaleString(numberLocale)} {t("common.kr")}
                </dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                  <dt>{t("orderDetail.discount")}</dt>
                  <dd className="tabular-nums font-medium">
                    −{order.discount.toLocaleString(numberLocale)} {t("common.kr")}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("orderDetail.vat")}</dt>
                <dd className="tabular-nums text-foreground">
                  {Math.round(order.total * 0.2).toLocaleString(numberLocale)} {t("common.kr")}
                </dd>
              </div>
              <div className="mt-3 flex justify-between gap-4 border-t border-border/60 pt-3">
                <dt className="text-base font-semibold text-foreground">{t("orderDetail.total")}</dt>
                <dd className="text-base font-semibold tabular-nums text-foreground">
                  {order.total.toLocaleString(numberLocale)} {t("common.kr")}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
