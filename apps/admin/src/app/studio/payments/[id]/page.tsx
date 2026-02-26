"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft,
  Printer,
  Pencil,
  CreditCard,
  Package,
  Truck,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useState } from "react";

type OrderItem = {
  productName: string;
  productImage: string;
  quantity: number;
  price: number;
  total: number;
};

type OrderDetail = {
  id: string;
  orderId: number;
  orderNumber?: string;
  placedDate: string;
  customerName: string;
  customerEmail: string;
  address: string;
  phone?: string;
  paymentMethod: string;
  paymentLast4: string;
  subtotal: number;
  shipping: number;
  discount?: number;
  total: number;
  deliveryStatus: "processing" | "shipped" | "out_for_delivery" | "delivered";
  shippedDate?: string;
  servicePointName?: string;
  deliveryOption?: string;
  postNordTrackingId?: string;
  items: OrderItem[];
};

const DELIVERY_STEPS = [
  { id: "processing", label: "Behandlas", icon: Package },
  { id: "shipped", label: "Skickad", icon: Truck },
  { id: "out_for_delivery", label: "Under leverans", icon: Truck },
  { id: "delivered", label: "Levererad", icon: CheckCircle2 },
] as const;

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orders/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4 p-4 w-full">
        <div className="rounded-md border bg-card p-8 text-center text-muted-foreground">
          Laddar order...
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="space-y-4 p-4 w-full">
        <Button variant="outline" size="icon" className="bg-white" asChild>
          <Link href="/studio/payments">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="rounded-md border bg-card p-8 text-center text-muted-foreground">
          Order hittades inte.
        </div>
      </div>
    );
  }

  const stepIndex = DELIVERY_STEPS.findIndex((s) => s.id === order.deliveryStatus);
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 }).format(amount);
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-4 p-4 w-full">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" className="bg-white" asChild>
          <Link href="/studio/payments">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Printer className="mr-2 h-4 w-4" />
            Skriv ut
          </Button>
          <Button size="sm" className="bg-foreground text-background">
            <Pencil className="mr-2 h-4 w-4" />
            Redigera
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="space-y-3">
                <div>
                  <h1 className="text-xl font-semibold">
                    Order {order.orderNumber ?? `ORD-${order.orderId}`}
                  </h1>
                  <p className="text-xs text-muted-foreground">Beställd {formatDate(order.placedDate)}</p>
                </div>
                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm text-foreground mb-2">Kundinformation</p>
                  <p className="text-sm text-muted-foreground">{order.customerName}</p>
                  <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
                  {order.phone && (
                    <p className="text-sm text-muted-foreground">{order.phone}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{order.address}</p>
                  {order.servicePointName && (
                    <p className="text-sm text-muted-foreground">
                      Ombud: {order.servicePointName}
                    </p>
                  )}
                </div>
                <div className="pt-3">
                  <div className="bg-muted flex items-center justify-between gap-4 rounded-md border p-4">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-base font-medium">Betalningsmetod</p>
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            {order.paymentMethod} slutar på **** {order.paymentLast4}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col">
          <Card className="flex flex-1 flex-col">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Ordersammanfattning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delsumma</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Moms (25%)</span>
                <span>{formatCurrency((order.subtotal + order.shipping) * 0.2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frakt</span>
                <span>{formatCurrency(order.shipping)}</span>
              </div>
              {order.discount !== undefined && order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Rabatt</span>
                  <span>-{formatCurrency(order.discount)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Totalt</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="gap-4 py-4">
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-sm">Leveransstatus</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0">
          <div className="flex flex-col gap-4">
            <div className="mb-2 flex w-full justify-between">
              {DELIVERY_STEPS.map((step, i) => {
                const Icon = step.icon;
                const isComplete = i <= stepIndex;
                const isFirst = i === 0;
                const isLast = i === DELIVERY_STEPS.length - 1;
                return (
                  <div
                    key={step.id}
                    className={`flex flex-col shrink-0 ${
                      isFirst ? "items-start" : isLast ? "items-end" : "items-center"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isComplete ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <p className={`mt-2 text-xs text-center ${isComplete ? "font-medium" : "text-muted-foreground"}`}>
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-foreground transition-all"
                style={{ width: `${((stepIndex + 1) / DELIVERY_STEPS.length) * 100}%` }}
              />
            </div>
            {(order.shippedDate || order.postNordTrackingId) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 border border-sky-200">
                  Skickad
                </span>
                {order.shippedDate && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(order.shippedDate)}
                  </span>
                )}
                {order.postNordTrackingId && (
                  <span className="text-xs text-muted-foreground">
                    Spårningsnr: {order.postNordTrackingId}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Orderrader</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Produkt</th>
                  <th className="pb-2 font-medium w-16">Antal</th>
                  <th className="pb-2 font-medium text-right w-20">Pris</th>
                  <th className="pb-2 font-medium text-right w-20">Totalt</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-muted">
                          <img src={item.productImage} alt={item.productName} className="h-full w-full object-cover" />
                        </div>
                        <span className="font-medium">{item.productName}</span>
                      </div>
                    </td>
                    <td className="py-2">{item.quantity}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatCurrency(item.price)}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
