"use client";

import type { Order } from "@/lib/api";
import { useLanguage, useTranslation } from "@/i18n/context";
import Image from "next/image";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const POSTNORD_TRACKING_BASE =
  "https://www.postnord.se/vara-verktyg/spara-din-forsandelse";

const UPLOADS_BASE =
  process.env.NEXT_PUBLIC_UPLOADS_BASE || "http://localhost:3001";

function resolveImageUrl(path: string | null): string {
  if (!path) return "/products/1g.png";
  if (path.startsWith("/uploads/")) return `${UPLOADS_BASE}${path}`;
  if (path.startsWith("http")) return path;
  return path;
}

type OrderDetailModalProps = {
  order: Order | null;
  onClose: () => void;
};

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

  const numberLocale = locale === "en" ? "en-GB" : "sv-SE";

  const trackingUrl = order.postNordTrackingId
    ? `${POSTNORD_TRACKING_BASE}?shipmentId=${encodeURIComponent(order.postNordTrackingId)}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("orderDetail.orderTitle")} #{order.orderNumber}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("orderDetail.status")}</span>
            <span className="font-medium">{statusLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("orderDetail.date")}</span>
            <span>
              {new Date(order.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "sv-SE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
          {trackingUrl && (
            <a href={trackingUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="w-full">
                <ExternalLink className="w-3 h-3 mr-2" />
                {t("orderDetail.trackDelivery")}
              </Button>
            </a>
          )}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">{t("orderDetail.deliveryAddress")}</p>
            <p className="text-sm text-muted-foreground">
              {order.firstName} {order.lastName}
            </p>
            <p className="text-sm text-muted-foreground">
              {order.address}, {order.postalCode} {order.city}, {order.country}
            </p>
            {order.servicePointName && (
              <p className="text-sm text-muted-foreground mt-1">
                {t("orderDetail.servicePoint")}: {order.servicePointName}
              </p>
            )}
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">{t("orderDetail.products")}</p>
            {(order.items?.length ?? 0) > 0 ? (
              <ul className="space-y-3">
                {order.items!.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <div className="relative w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
                      <Image
                        src={resolveImageUrl(item.productImage)}
                        alt={item.productName || t("orderDetail.product")}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.productName || `${t("orderDetail.product")} #${item.productId ?? item.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {Number(item.price).toLocaleString(numberLocale)} kr
                      </p>
                    </div>
                    <p className="text-sm font-medium shrink-0">
                      {(Number(item.price) * item.quantity).toLocaleString(numberLocale)} kr
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("orderDetail.noProductDetails")}</p>
            )}
          </div>
          <div className="border-t pt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("orderDetail.subtotal")}</span>
              <span>{order.subtotal.toLocaleString(numberLocale)} kr</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("orderDetail.shipping")}</span>
              <span>{order.shippingCost.toLocaleString(numberLocale)} kr</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t("orderDetail.discount")}</span>
                <span>-{order.discount.toLocaleString(numberLocale)} kr</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("orderDetail.vat")}</span>
              <span>
                {Math.round(order.total * 0.2).toLocaleString(numberLocale)} kr
              </span>
            </div>
            <div className="flex justify-between font-semibold pt-2">
              <span>{t("orderDetail.total")}</span>
              <span>{order.total.toLocaleString(numberLocale)} kr</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
