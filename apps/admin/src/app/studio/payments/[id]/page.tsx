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
  placedDate: string;
  customerName: string;
  customerEmail: string;
  address: string;
  paymentMethod: string;
  paymentLast4: string;
  subtotal: number;
  shipping: number;
  total: number;
  deliveryStatus: "processing" | "shipped" | "out_for_delivery" | "delivered";
  shippedDate?: string;
  items: OrderItem[];
};

function getOrderDetail(id: string): OrderDetail {
  const mockOrders: Record<string, OrderDetail> = {
    "728ed521": {
      id: "728ed521",
      orderId: 812312,
      placedDate: "2025-04-15",
      customerName: "John Doe",
      customerEmail: "johndoe@gmail.com",
      address: "Storgatan 123, 123 45 Stockholm",
      paymentMethod: "Visa",
      paymentLast4: "1234",
      subtotal: 85,
      shipping: 49,
      total: 134,
      deliveryStatus: "shipped",
      shippedDate: "2024-12-23",
      items: [
        { productName: "Trådlösa hörlurar", productImage: "/products/1g.png", quantity: 2, price: 42.5, total: 85 },
        { productName: "Bluetooth-högtalare", productImage: "/products/2g.png", quantity: 1, price: 49, total: 49 },
      ],
    },
    "728ed522": {
      id: "728ed522",
      orderId: 812313,
      placedDate: "2025-04-14",
      customerName: "Jane Doe",
      customerEmail: "janedoe@gmail.com",
      address: "Kungsgatan 45, 111 56 Stockholm",
      paymentMethod: "Visa",
      paymentLast4: "5678",
      subtotal: 75,
      shipping: 49,
      total: 124,
      deliveryStatus: "delivered",
      shippedDate: "2024-12-20",
      items: [
        { productName: "Bluetooth-högtalare", productImage: "/products/2g.png", quantity: 2, price: 37.5, total: 75 },
      ],
    },
  };
  const order = mockOrders[id];
  if (order) return order;
  return {
    id,
    orderId: parseInt(id.slice(-6), 16) || 812300,
    placedDate: new Date().toISOString().slice(0, 10),
    customerName: "Kund",
    customerEmail: "kund@example.com",
    address: "Adress ej tillgänglig",
    paymentMethod: "Kort",
    paymentLast4: "****",
    subtotal: 0,
    shipping: 0,
    total: 0,
    deliveryStatus: "processing",
    items: [],
  };
}

const DELIVERY_STEPS = [
  { id: "processing", label: "Behandlas", icon: Package },
  { id: "shipped", label: "Skickad", icon: Truck },
  { id: "out_for_delivery", label: "Under leverans", icon: Truck },
  { id: "delivered", label: "Levererad", icon: CheckCircle2 },
] as const;

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const order = getOrderDetail(id);

  const stepIndex = DELIVERY_STEPS.findIndex((s) => s.id === order.deliveryStatus);
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 }).format(amount);
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
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
                  <h1 className="text-xl font-semibold">Order ORD-{order.orderId}</h1>
                  <p className="text-xs text-muted-foreground">Beställd {formatDate(order.placedDate)}</p>
                </div>
                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm text-foreground mb-2">Kundinformation</p>
                  <p className="text-sm text-muted-foreground">{order.customerName}</p>
                  <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
                  <p className="text-sm text-muted-foreground">{order.address}</p>
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
            {order.shippedDate && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 border border-sky-200">
                  Skickad
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(order.shippedDate)}</span>
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
