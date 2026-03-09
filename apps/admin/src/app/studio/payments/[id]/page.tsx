"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft,
  Printer,
  CreditCard,
  Package,
  Truck,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "react-toastify";

type OrderItem = {
  productName: string;
  productImage: string;
  variant?: string;
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
  status?: string;
  deliveryStatus: "processing" | "shipped" | "out_for_delivery" | "delivered";
  shippedDate?: string;
  servicePointName?: string;
  deliveryOption?: string;
  postNordTrackingId?: string;
  items: OrderItem[];
};

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Behandlas" },
  { value: "shipped", label: "Skickad" },
  { value: "delivered", label: "Levererad" },
  { value: "cancelled", label: "Avbruten" },
] as const;

function toValidTrackingId(val: unknown): string {
  if (val == null) return "";
  const s = String(val).trim();
  return s && s.toLowerCase() !== "null" ? s : "";
}

const DELIVERY_STEPS = [
  { id: "processing", label: "Behandlas", icon: Package },
  { id: "shipped", label: "Skickad", icon: Truck },
  { id: "out_for_delivery", label: "Under leverans", icon: Truck },
  { id: "delivered", label: "Levererad", icon: CheckCircle2 },
] as const;

type TrackingEvent = { time?: string; description?: string; location?: string };

function extractTrackingEvents(data: Record<string, unknown>): TrackingEvent[] {
  const events: TrackingEvent[] = [];
  const root = (data.TrackingInformationResponse ?? data) as Record<string, unknown>;
  const shipments = (root.shipment ?? root.shipments ?? []) as unknown[];
  for (const s of Array.isArray(shipments) ? shipments : []) {
    const shipment = (s as Record<string, unknown>) ?? {};
    const items = (shipment.item ?? shipment.items ?? []) as unknown[];
    for (const it of Array.isArray(items) ? items : []) {
      const item = (it as Record<string, unknown>) ?? {};
      const evts = (item.event ?? item.events ?? []) as unknown[];
      for (const e of Array.isArray(evts) ? evts : []) {
        const ev = (e as Record<string, unknown>) ?? {};
        const loc = ev.location as Record<string, unknown> | undefined;
        const rawTime = ev.eventTime ?? ev.timestamp ?? ev.date;
        const rawDesc = ev.eventDescription ?? ev.description ?? ev.status;
        events.push({
          time: rawTime != null ? String(rawTime) : undefined,
          description: rawDesc != null ? String(rawDesc) : undefined,
          location: loc ? (String(loc.city ?? loc.name ?? loc.address ?? "").trim() || undefined) : undefined,
        });
      }
    }
  }
  return events.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
}

function TrackingEvents({ data }: { data: Record<string, unknown> }) {
  const events = extractTrackingEvents(data);
  if (events.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Inga spårningshändelser hittades.
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      {events.map((ev, i) => (
        <div key={i} className="flex flex-col gap-0.5 border-b border-border/50 pb-2 last:border-0 last:pb-0">
          {ev.time && <span className="text-[11px] text-muted-foreground">{ev.time}</span>}
          {ev.description && <span className="text-xs font-medium">{ev.description}</span>}
          {ev.location && <span className="text-[11px] text-muted-foreground">{ev.location}</span>}
        </div>
      ))}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editTrackingId, setEditTrackingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [trackingData, setTrackingData] = useState<Record<string, unknown> | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orders/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setOrder(data);
        if (data) {
          setEditStatus(data.status ?? "confirmed");
          setEditTrackingId(toValidTrackingId(data.postNordTrackingId));
        }
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchTrackingStatus = async () => {
    const tid = toValidTrackingId(order?.postNordTrackingId) || editTrackingId.trim();
    if (!tid) return;
    setTrackingLoading(true);
    setTrackingError(null);
    try {
      const res = await fetch(`/api/postnord/track?trackingId=${encodeURIComponent(tid)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTrackingError(data?.error ?? "Kunde inte hämta spårningsstatus");
        setTrackingData(null);
        return;
      }
      setTrackingData(data);
      setTrackingError(null);
    } catch {
      setTrackingError("Kunde inte hämta spårningsstatus");
      setTrackingData(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!id || !order) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          postNordTrackingId: (editStatus === "shipped" || editStatus === "delivered")
            ? (editTrackingId.trim() || null)
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Kunde inte spara");
        return;
      }
      toast.success("Status uppdaterad");
      const refetch = await fetch(`/api/orders/${id}`);
      const updated = await refetch.json();
      setOrder(updated);
      setEditStatus(updated.status ?? "confirmed");
      setEditTrackingId(toValidTrackingId(updated.postNordTrackingId));
    } catch {
      toast.error("Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

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
        <Button variant="outline" size="sm" className="bg-white" asChild>
          <Link href="/studio/payments">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Tillbaka
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
        <Button variant="outline" size="sm" className="bg-white" asChild>
          <Link href="/studio/payments">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Tillbaka
          </Link>
        </Button>
        <Button variant="outline" size="sm">
          <Printer className="mr-2 h-4 w-4" />
          Skriv ut
        </Button>
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
                  <div className="bg-muted flex items-center gap-3 rounded-md border p-4">
                    <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-base font-medium">Betalningsmetod</p>
                      <p className="text-sm text-muted-foreground">
                        {order.paymentLast4 && order.paymentLast4 !== "—"
                          ? `${order.paymentMethod} slutar på **** ${order.paymentLast4}`
                          : `${order.paymentMethod}`}
                      </p>
                    </div>
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
                return (
                  <div
                    key={step.id}
                    className="flex shrink-0 flex-col items-center"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          isComplete ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <p className={`text-xs ${isComplete ? "font-medium" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                    </div>
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
            <div className="mt-4 space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="order-status" className="text-xs">Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger id="order-status" className="w-[180px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(editStatus === "shipped" || editStatus === "delivered") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="order-tracking" className="text-xs">PostNord spårningsnr</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="order-tracking"
                        placeholder="Klistra in från PostNord-kvitto"
                        value={editTrackingId}
                        onChange={(e) => setEditTrackingId(e.target.value)}
                        className="h-9 w-[200px]"
                      />
                      {(editTrackingId.trim() || toValidTrackingId(order.postNordTrackingId)) && (
                        <a
                          href={`https://www.postnord.se/en/our-tools/track-and-trace?shipmentId=${encodeURIComponent(editTrackingId.trim() || toValidTrackingId(order.postNordTrackingId) || "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-sky-600 hover:text-sky-700 hover:underline shrink-0"
                        >
                          Spåra
                        </a>
                      )}
                    </div>
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={handleSaveStatus}
                  disabled={saving}
                  className="h-9"
                >
                  {saving ? "Sparar..." : "Spara"}
                </Button>
              </div>
            </div>
            {(order.shippedDate || toValidTrackingId(order.postNordTrackingId)) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 border border-sky-200">
                  Skickad
                </span>
                {order.shippedDate && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(order.shippedDate)}
                  </span>
                )}
                {toValidTrackingId(order.postNordTrackingId) && (
                  <a
                    href={`https://www.postnord.se/en/our-tools/track-and-trace?shipmentId=${encodeURIComponent(toValidTrackingId(order.postNordTrackingId))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Spårningsnr: {toValidTrackingId(order.postNordTrackingId)} →
                  </a>
                )}
              </div>
            )}
            {(editStatus === "shipped" || editStatus === "delivered") && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium">Spårningsstatus från PostNord</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={fetchTrackingStatus}
                    disabled={trackingLoading || !(editTrackingId.trim() || toValidTrackingId(order.postNordTrackingId))}
                  >
                    {trackingLoading ? "Hämtar..." : "Hämta status"}
                  </Button>
                </div>
                {trackingError && (
                  <p className="text-xs text-destructive">{trackingError}</p>
                )}
                {trackingData && (
                  <TrackingEvents data={trackingData} />
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
                        <div>
                          <span className="font-medium">{item.productName}</span>
                          {item.variant && (
                            <span className="block text-sm text-muted-foreground">{item.variant}</span>
                          )}
                        </div>
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
