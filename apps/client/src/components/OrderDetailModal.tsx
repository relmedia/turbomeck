"use client";

import type { Order } from "@/lib/api";
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

const statusLabels: Record<string, string> = {
  confirmed: "Bekräftad",
  shipped: "Skickad",
  delivered: "Levererad",
  cancelled: "Avbruten",
};

type OrderDetailModalProps = {
  order: Order | null;
  onClose: () => void;
};

export default function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  if (!order) return null;

  const trackingUrl = order.postNordTrackingId
    ? `${POSTNORD_TRACKING_BASE}?shipmentId=${encodeURIComponent(order.postNordTrackingId)}`
    : null;
  const statusLabel = statusLabels[order.status] ?? order.status;

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
          <h2 className="text-lg font-semibold">Beställning #{order.orderNumber}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            aria-label="Stäng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{statusLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Datum</span>
            <span>
              {new Date(order.createdAt).toLocaleDateString("sv-SE", {
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
                Spåra leverans
              </Button>
            </a>
          )}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Leveransadress</p>
            <p className="text-sm text-muted-foreground">
              {order.firstName} {order.lastName}
            </p>
            <p className="text-sm text-muted-foreground">
              {order.address}, {order.postalCode} {order.city}, {order.country}
            </p>
            {order.servicePointName && (
              <p className="text-sm text-muted-foreground mt-1">
                Ombud: {order.servicePointName}
              </p>
            )}
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Produkter</p>
            {(order.items?.length ?? 0) > 0 ? (
              <ul className="space-y-3">
                {order.items!.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <div className="relative w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
                      <Image
                        src={resolveImageUrl(item.productImage)}
                        alt={item.productName || "Produkt"}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.productName || `Produkt #${item.productId ?? item.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {Number(item.price).toLocaleString("sv-SE")} kr
                      </p>
                    </div>
                    <p className="text-sm font-medium shrink-0">
                      {(Number(item.price) * item.quantity).toLocaleString("sv-SE")} kr
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Inga produktuppgifter tillgängliga.</p>
            )}
          </div>
          <div className="border-t pt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delsumma</span>
              <span>{order.subtotal.toLocaleString("sv-SE")} kr</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frakt</span>
              <span>{order.shippingCost.toLocaleString("sv-SE")} kr</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Rabatt</span>
                <span>-{order.discount.toLocaleString("sv-SE")} kr</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Moms (25%)</span>
              <span>
                {Math.round(order.total * 0.2).toLocaleString("sv-SE")} kr
              </span>
            </div>
            <div className="flex justify-between font-semibold pt-2">
              <span>Totalt</span>
              <span>{order.total.toLocaleString("sv-SE")} kr</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
