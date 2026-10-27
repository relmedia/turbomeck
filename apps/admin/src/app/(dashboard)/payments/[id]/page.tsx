"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatAmount, normalizeCurrency } from "@repo/currency";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import {
  AlertTriangle,
  ChevronLeft,
  Printer,
  CreditCard,
  Loader2,
  Mail,
  Package,
  Truck,
  CheckCircle2,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "react-toastify";
import { LabelPrintDialog } from "@/components/LabelPrintDialog";
import { postNordTrackingUrl } from "@repo/shipping";
import { DashboardOrderDetailSkeleton } from "@/components/dashboard-skeletons";
import { Skeleton } from "@repo/ui/components/skeleton";
import { resolveImageUrl } from "@/lib/image-utils";
import RefundSection from "@/components/RefundSection";

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
  viewToken?: string | null;
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
  /** Currency the order was charged in; absent on pre-multi-currency orders. */
  currency?: string;
  /** `domestic` | `eu_b2c` | `export_zero_rated`; null on pre-0026 orders. */
  vatTreatment?: string | null;
  vatRate?: number | null;
  vatAmount?: number | null;
  depositAmount?: number;
  balanceDue?: number;
  commitsCoreReturnWithin14?: boolean | null;
  coreKeepFeeSek?: number;
  coreReturnDeadline?: string | null;
  coreReceivedAt?: string | null;
  status?: string;
  deliveryStatus: "processing" | "shipped" | "out_for_delivery" | "delivered";
  servicePointName?: string;
  servicePointId?: string;
  deliveryOption?: string;
  country?: string;
  postNordTrackingId?: string;
  /** True when PostNord booking stored a label snapshot (PDF can be downloaded). */
  hasPostNordLabel?: boolean;
  items: OrderItem[];
};

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Behandlas" },
  { value: "shipped", label: "Skickad" },
  { value: "delivered", label: "Levererad" },
  { value: "completed", label: "Slutförd" },
  { value: "cancelled", label: "Avbruten" },
  /**
   * Required, not cosmetic: handleSaveStatus ends with setEditStatus(updated.status),
   * and a Select whose value matches no SelectItem renders an empty trigger.
   */
  { value: "partially_refunded", label: "Delvis återbetald" },
  { value: "refunded", label: "Återbetald" },
] as const;

type PostNordPrintoutOption = {
  labelType: string;
  paperSize: string[];
  rotate?: string[];
  definePrintout?: string[];
  customs?: string[];
  format: string;
};
;

function toValidTrackingId(val: unknown): string {
  if (val == null) return "";
  const s = String(val).trim();
  return s && s.toLowerCase() !== "null" ? s : "";
}


type OrderEmailRow = {
  kind: string;
  sentAt: string | null;
  claimedAt: string;
  recipient: string | null;
  error: string | null;
};

/**
 * Swedish names for the ledger kinds. An unknown kind falls back to its raw
 * value rather than disappearing — a mail that went out should always be
 * visible here, even one added after this map was written.
 */
const ORDER_EMAIL_LABELS: Record<string, string> = {
  order_confirmation: "Orderbekräftelse",
  shipment_dispatched: "Skickad + spårlänk",
  ready_for_pickup: "Klar att hämta",
  pickup_reminder_1: "Påminnelse 1",
  pickup_reminder_2: "Påminnelse 2",
  order_delivered: "Levererad",
  core_return_reminder: "Kärnretur — påminnelse",
  core_return_overdue: "Kärnretur — försenad (till er)",
};

const DELIVERY_STEPS = [
  { id: "processing", label: "Behandlas", icon: Package },
  { id: "shipped", label: "Skickad", icon: Truck },
  { id: "out_for_delivery", label: "Under leverans", icon: Truck },
  { id: "delivered", label: "Levererad", icon: CheckCircle2 },
] as const;

type TrackingEvent = { time?: string; description?: string; location?: string };

type TrackedShipment = {
  shipment: Record<string, unknown>;
  items: Record<string, unknown>[];
};

/** Track Shipment v5 and v2 wrap the same shape in plural or singular keys. */
function extractTrackedShipments(data: Record<string, unknown>): TrackedShipment[] {
  const root = (data.TrackingInformationResponse ?? data) as Record<string, unknown>;
  const shipments = (root.shipment ?? root.shipments ?? []) as unknown[];
  const out: TrackedShipment[] = [];
  for (const s of Array.isArray(shipments) ? shipments : []) {
    const shipment = (s as Record<string, unknown>) ?? {};
    const items = (shipment.item ?? shipment.items ?? []) as unknown[];
    out.push({
      shipment,
      items: (Array.isArray(items) ? items : []).map(
        (it) => (it as Record<string, unknown>) ?? {},
      ),
    });
  }
  return out;
}

type TrackingIdentifiers = { shipmentIds: string[]; itemIds: string[] };

/**
 * The numbers PostNord holds for the shipment. The item id is the parcel
 * number printed on the label — what a customer enters on "spåra din
 * försändelse" — and it is not always what booking handed back, which can
 * be the shipment id instead.
 */
function extractTrackingIdentifiers(
  data: Record<string, unknown>,
): TrackingIdentifiers {
  const shipmentIds: string[] = [];
  const itemIds: string[] = [];
  const push = (list: string[], val: unknown) => {
    const id = toValidTrackingId(val);
    if (id && !list.includes(id)) list.push(id);
  };
  for (const { shipment, items } of extractTrackedShipments(data)) {
    const sid = shipment.shipmentIdentification as Record<string, unknown> | undefined;
    push(shipmentIds, shipment.shipmentId ?? sid?.shipmentId ?? shipment.id);
    for (const item of items) {
      const iid = item.itemIdentification as Record<string, unknown> | undefined;
      push(itemIds, item.itemId ?? iid?.itemId ?? item.id);
    }
  }
  return { shipmentIds, itemIds };
}

function extractTrackingEvents(data: Record<string, unknown>): TrackingEvent[] {
  const events: TrackingEvent[] = [];
  for (const { items } of extractTrackedShipments(data)) {
    for (const item of items) {
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

function TrackingIdentifiers({
  data,
  savedId,
  onUse,
}: {
  data: Record<string, unknown>;
  savedId: string;
  onUse: (id: string) => void;
}) {
  const { shipmentIds, itemIds } = extractTrackingIdentifiers(data);
  /** Prefer the parcel numbers; fall back to the shipment id if that is all PostNord returned. */
  const parcelIds = itemIds.length > 0 ? itemIds : shipmentIds;
  const otherShipmentIds =
    itemIds.length > 0 ? shipmentIds.filter((id) => !itemIds.includes(id)) : [];

  if (parcelIds.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {parcelIds.length > 1 ? "Spårningsnummer (paket)" : "Spårningsnummer"}
      </p>
      <ul className="space-y-1.5">
        {parcelIds.map((id) => (
          <li key={id} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs break-all">{id}</span>
            <a
              href={postNordTrackingUrl(id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-sky-600 hover:text-sky-700 hover:underline shrink-0"
            >
              Spåra
            </a>
            {id === savedId ? (
              <span className="text-[11px] text-muted-foreground shrink-0">
                sparat på ordern
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onUse(id)}
              >
                Använd
              </Button>
            )}
          </li>
        ))}
      </ul>
      {otherShipmentIds.length > 0 && (
        <p className="text-[11px] text-muted-foreground break-all">
          Försändelse-id:{" "}
          <span className="font-mono">{otherShipmentIds.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

function payBalanceStorefrontUrl(order: Pick<OrderDetail, "orderId" | "viewToken">): string {
  const base =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_CLIENT_URL || window.location.origin.replace("3002", "3000")
      : "";
  const q = new URLSearchParams({ orderId: String(order.orderId) });
  if (order.viewToken) q.set("token", order.viewToken);
  return `${base}/order/pay-balance?${q.toString()}`;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editTrackingId, setEditTrackingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [trackingData, setTrackingData] = useState<Record<string, unknown> | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [markingCoreReceived, setMarkingCoreReceived] = useState(false);
  const [postnordBooking, setPostnordBooking] = useState(false);
  /**
   * Held as a string, not a number. `parseFloat(e.target.value) || 0` meant a
   * cleared field rendered "0" while the payload silently booked 3 kg.
   */
  const [bookWeightKg, setBookWeightKg] = useState("");
  const [preflight, setPreflight] = useState<BookingPreflight | null>(null);
  const [orderEmails, setOrderEmails] = useState<OrderEmailRow[]>([]);
  const [bookingError, setBookingError] = useState<{
    error: string;
    details?: string;
    diagnostics?: unknown;
  } | null>(null);
  const [sendingShipmentEmail, setSendingShipmentEmail] = useState(false);
  const [confirmRebookOpen, setConfirmRebookOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

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

  const handleMarkCoreReceived = async () => {
    if (!id) return;
    setMarkingCoreReceived(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coreReceived: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Kunde inte markera");
        return;
      }
      toast.success("Gamla delen mottagen");
      const refetch = await fetch(`/api/orders/${id}`);
      setOrder(await refetch.json());
    } catch {
      toast.error("Kunde inte markera");
    } finally {
      setMarkingCoreReceived(false);
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
      if (data.shipmentEmailSent === true) {
        toast.info("Leveransmejl skickat till kunden");
      } else if (data.shipmentEmailSent === false && data.shipmentEmailError) {
        toast.warn(`Leveransmejl skickades inte: ${data.shipmentEmailError}`);
      }
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

  /** Preflight: eligibility, config readiness, suggested weight, booked state. */
  type BookingPreflight = {
    eligible: boolean;
    ineligibleReason: { code: string; message: string } | null;
    booked: {
      isBooked: boolean;
      /** Set when staff marked the booking cancelled in PostNord's portal. */
      cancelledAt: string | null;
      trackingId: string | null;
      printId: string | null;
      hasLabel: boolean;
      labelPaperSize: string | null;
      bookedAt: string | null;
      testBooking: boolean;
      weightKg: number | null;
    };
    weight: {
      suggestedKg: number;
      source: "products" | "fallback";
      oversize: boolean;
      missingWeights: string[];
    };
    config: {
      ready: boolean;
      mode: "test" | "production";
      host: string;
      blocking: { key: string; label: string; hint: string }[];
      warnings: { key: string; label: string; hint: string; shownValue?: string }[];
    };
  };

  const [cancelling, setCancelling] = useState(false);
  const [sendingConfirmation, setSendingConfirmation] = useState(false);

  /**
   * Send the "tack för ditt köp" mail for this order.
   *
   * Needed because an order created in admin never sends one — persistOrder
   * suppresses it for staff-created orders. The shop knows about the order;
   * the customer does not.
   */
  const sendOrderConfirmation = async (force = false) => {
    if (!id) return;
    setSendingConfirmation(true);
    try {
      const res = await fetch(
        `/api/orders/${id}/send-confirmation${force ? "?force=true" : ""}`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        alreadySent?: boolean;
        recipient?: string;
      };
      if (res.status === 409 && data.alreadySent) {
        // Already sent once. Ask rather than silently duplicating it.
        if (window.confirm("Orderbekräftelsen har redan skickats. Skicka igen?")) {
          await sendOrderConfirmation(true);
        }
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`Orderbekräftelse skickad till ${data.recipient ?? "kunden"}`);
      await refreshOrderEmails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skicka bekräftelsen");
    } finally {
      setSendingConfirmation(false);
    }
  };

  /**
   * Records that the booking was cancelled in PostNord's portal, or undoes that
   * mark. It does not cancel anything at PostNord — they expose no API for it,
   * so the portal is the only place a parcel can actually be stopped.
   */
  const setBookingCancelled = async (cancelled: boolean) => {
    if (!id) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${id}/postnord-book-shipment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success(cancelled ? "Bokningen markerad som avbruten" : "Markeringen borttagen");
      await refreshPreflight();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte uppdatera bokningen");
    } finally {
      setCancelling(false);
    }
  };

  const refreshPreflight = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/orders/${id}/postnord-book-shipment`);
      setPreflight(res.ok ? await res.json() : null);
    } catch {
      setPreflight(null);
    }
  }, [id]);

  /**
   * What the automation has mailed this customer.
   *
   * Worth its own request rather than widening the preflight: the preflight is
   * about whether a parcel CAN be booked, and this is a log of what already
   * happened. They change at different times and for different reasons.
   */
  const refreshOrderEmails = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/orders/${id}/emails`);
      if (!res.ok) return setOrderEmails([]);
      const data = (await res.json()) as { emails?: OrderEmailRow[] };
      setOrderEmails(data.emails ?? []);
    } catch {
      setOrderEmails([]);
    }
  }, [id]);

  useEffect(() => {
    void refreshPreflight();
    void refreshOrderEmails();
  }, [refreshPreflight, refreshOrderEmails]);

  // Prefill the weight from the products once the preflight lands, unless the
  // admin has already typed something.
  useEffect(() => {
    if (preflight && bookWeightKg === "") {
      setBookWeightKg(String(preflight.weight.suggestedKg));
    }
  }, [preflight, bookWeightKg]);

  const handleSendShipmentEmail = async () => {
    if (!id) return;
    setSendingShipmentEmail(true);
    try {
      const res = await fetch(`/api/orders/${id}/send-shipment-email`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Kunde inte skicka mejlet");
        return;
      }
      toast.success("Leveransmejl skickat till kund");
    } catch {
      toast.error("Kunde inte skicka mejlet");
    } finally {
      setSendingShipmentEmail(false);
    }
  };

  const handlePostnordBook = async (replaceExisting = false) => {
    if (!id || !order) return;

    const weight = Number(bookWeightKg);
    if (!Number.isFinite(weight) || weight < 0.1 || weight > 35) {
      setBookingError({ error: "Ange en vikt mellan 0,1 och 35 kg." });
      return;
    }

    setPostnordBooking(true);
    setBookingError(null);
    try {
      const res = await fetch(`/api/orders/${id}/postnord-book-shipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg: weight,
          ...(replaceExisting ? { replaceExisting: true } : {}),
          // Only meaningful against the test API; the server ignores it otherwise.
          ...(preflight && !preflight.config.ready && preflight.config.mode === "test"
            ? { allowUnconfigured: true }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Keep the full rejection on screen. It used to go to the browser
        // console (and only when under 500 chars), which is why nobody could
        // say why booking failed.
        setBookingError({
          error: typeof data.error === "string" ? data.error : "Bokning misslyckades",
          details: typeof data.details === "string" ? data.details : undefined,
          diagnostics: data.diagnostics,
        });
        toast.error(typeof data.error === "string" ? data.error : "Bokning misslyckades");
        return;
      }

      if (data.needsManualId) {
        toast.warn(
          "PostNord accepterade bokningen men returnerade inget spårningsnummer — hämta det i PostNords portal."
        );
        setBookingError({
          error:
            "Bokningen gick igenom men PostNord returnerade inget spårningsnummer. Paketet finns — hämta numret i PostNords portal och klistra in det i fältet ovan.",
          diagnostics: data.diagnostics,
        });
      } else {
        toast.success(`Frakt bokad — spårning: ${data.postNordTrackingId ?? ""}`);
      }
      if (data.postNordLabelAvailable === false) {
        /* The label arrives with the booking and is stored then. If it did not,
           it cannot be fetched afterwards — asking PostNord for it again books
           another parcel — so the label has to come from their portal. */
        toast.warn(
          "PostNord skickade ingen etikett med bokningen. Hämta den i PostNords portal; den går inte att hämta i efterhand härifrån.",
        );
      }

      const refetch = await fetch(`/api/orders/${id}`);
      const updated = await refetch.json();
      setOrder(updated);
      setEditStatus(updated.status ?? "confirmed");
      setEditTrackingId(toValidTrackingId(updated.postNordTrackingId));
      await refreshPreflight();
    } catch (err) {
      setBookingError({
        error: "Bokning misslyckades",
        details: err instanceof Error ? err.message : String(err),
      });
      toast.error("Bokning misslyckades");
    } finally {
      setPostnordBooking(false);
    }
  };

  if (loading) {
    return <DashboardOrderDetailSkeleton />;
  }
  if (!order) {
    return (
      <div className="space-y-4 p-4 w-full">
        <Button variant="outline" size="sm" className="bg-white" asChild>
          <Link href="/payments">
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
  /**
   * Read from the saved order rather than `editStatus`: picking a status in the
   * dropdown must not make the page claim a refund that has not been saved.
   */
  const isFullyRefunded = order.status === "refunded";
  const isPartlyRefunded = order.status === "partially_refunded";

  const handleDeleteOrder = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Kunde inte ta bort order",
        );
      }
      toast.success(
        `Order ${order.orderNumber ?? `#${order.orderId}`} har tagits bort`,
      );
      setDeleteDialogOpen(false);
      router.push("/payments");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Kunde inte ta bort order",
      );
      setDeleting(false);
    }
  };

  /**
   * Shows the order in the currency it was actually charged in — not SEK,
   * which this used to hardcode. An EUR order displayed as "1 234,00 kr" makes
   * Stripe reconciliation impossible and the figure is simply wrong.
   *
   * Orders predating multi-currency carry no value and normalise to SEK.
   */
  const orderCurrency = normalizeCurrency(order?.currency);
  const formatCurrency = (amount: number) =>
    formatAmount(amount, orderCurrency);
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-4 p-4 w-full">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="bg-white" asChild>
          <Link href="/payments">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Tillbaka
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {/* Prints the order page. The shipping label has its own PDF button
              in the Försändelse block — this one had no onClick at all. */}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Skriv ut order
          </Button>
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="bg-white border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Ta bort
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Ta bort order?</AlertDialogTitle>
                <AlertDialogDescription>
                  Du håller på att ta bort order{" "}
                  <span className="font-medium text-foreground">
                    {order.orderNumber ?? `#${order.orderId}`}
                  </span>{" "}
                  för {order.customerName}. Orderrader och tillhörande data
                  raderas permanent. Denna åtgärd kan inte ångras.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteOrder}
                  disabled={deleting}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {deleting ? (
                    <>
                      <Skeleton className="mr-2 h-4 w-4 shrink-0 rounded" />
                      Tar bort...
                    </>
                  ) : (
                    "Ta bort permanent"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                <div className="pt-3 space-y-3">
                  {/* Betalningsmetod.
                      The glyph used to be vertically centred against a
                      two-line stack, so it floated at the midpoint attached to
                      neither line. It now aligns to the top line.

                      The hierarchy was also inverted: "Betalningsmetod" — the
                      label — was the largest text, and the card itself was
                      muted beneath it. The label is now a quiet caption and the
                      card is the headline. */}
                  <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3">
                    <CreditCard
                      className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Betalningsmetod
                      </p>
                      <p className="mt-0.5 text-sm font-medium leading-tight">
                        {order.paymentMethod}
                      </p>
                      {order.paymentLast4 && order.paymentLast4 !== "—" && (
                        /* Grouped like a card number rather than spelled out as
                           "slutar på **** 4242" — the shape carries the meaning,
                           and it stays scannable next to a Stripe dashboard. */
                        <p className="mt-1 font-mono text-xs tracking-[0.2em] text-muted-foreground">
                          •••• {order.paymentLast4}
                        </p>
                      )}
                    </div>
                  </div>
                  {(order.commitsCoreReturnWithin14 === true ||
                    (order.coreKeepFeeSek ?? 0) > 0) && (
                    <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                      <p className="font-medium text-sm">Kärnretur (nya flödet)</p>
                      {order.commitsCoreReturnWithin14 === true && order.coreReturnDeadline && (
                        <p className="text-muted-foreground">
                          Kund åtar sig retur av gammal turbo senast{" "}
                          {formatDate(new Date(order.coreReturnDeadline).toISOString().slice(0, 10))}.
                          Vid utebliven retur kan 1&nbsp;000 kr faktureras (se köpvillkor).
                        </p>
                      )}
                      {order.coreKeepFeeSek != null && order.coreKeepFeeSek > 0 && (
                        <p className="text-muted-foreground">
                          Kärnavgift betald i kassan: {formatCurrency(order.coreKeepFeeSek)}
                        </p>
                      )}
                    </div>
                  )}
                  {order.depositAmount != null && order.depositAmount > 0 && order.balanceDue != null && order.balanceDue > 0 && !order.coreReceivedAt && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleMarkCoreReceived}
                        disabled={markingCoreReceived}
                      >
                        {markingCoreReceived ? "Sparar..." : "Gamla del mottagen"}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Markera när kundens gamla turbo har kommit in – då kan du skicka den nya och kund betalar resten.
                      </span>
                    </div>
                  )}
                  {order.coreReceivedAt && (
                    <p className="text-xs text-emerald-600 font-medium">
                      Gamla del mottagen {formatDate(new Date(order.coreReceivedAt).toISOString().slice(0, 10))}
                    </p>
                  )}
                  {order.balanceDue != null && order.balanceDue > 0 && order.coreReceivedAt && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                      <p className="text-sm font-medium mb-1">Betalningslänk för återstod</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        Skicka denna länk till kunden så kan de betala {formatCurrency(order.balanceDue)}.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-white dark:bg-muted px-2 py-1 rounded truncate max-w-[240px]">
                          {typeof window !== "undefined" ? payBalanceStorefrontUrl(order) : ""}
                        </code>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const url = payBalanceStorefrontUrl(order);
                            if (!order.viewToken) {
                              toast.error("Order saknar säkerhetstoken — spara om ordern eller kör DB-migration.");
                              return;
                            }
                            navigator.clipboard.writeText(url);
                            toast.success("Länk kopierad");
                          }}
                        >
                          Kopiera
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4 py-4">
            <CardHeader className="py-2 px-4">
              {/* The heading states the current step. The stepper shows *where*
                  in the sequence it sits; the name of the state should not have
                  to be inferred from which circle is outlined. */}
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Leveransstatus</CardTitle>
                <span className="text-xs font-medium text-muted-foreground">
                  {isFullyRefunded
                    ? "Återbetald"
                    : (DELIVERY_STEPS[Math.min(Math.max(stepIndex, 0), DELIVERY_STEPS.length - 1)]?.label ?? "")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <div className="flex flex-col gap-4">
                {/* A fully refunded order has no parcel to follow, so the
                    stepper is replaced rather than left resting on
                    "Behandlas" — which read as work still to do. A PARTIAL
                    refund keeps its stepper: the goods may well still ship,
                    and only the money moved. */}
                {isFullyRefunded ? (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background text-muted-foreground">
                      <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">Återbetald</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Hela beloppet är återbetalt — ingen leverans att följa.
                      </p>
                    </div>
                  </div>
                ) : (
                <>
                {isPartlyRefunded && (
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <p className="text-[11px] leading-tight">
                      Delvis återbetald. Leveransen nedan gäller fortfarande.
                    </p>
                  </div>
                )}
                {/* Connected stepper.
                    Replaces a grid of unconnected circles plus a separate
                    gradient bar — two indicators of the same thing, neither
                    showing how far along the parcel was. The track now runs
                    centre-to-centre between the first and last step and fills
                    to the current one, so progress is read from the line
                    itself. Labels sit under their icon rather than beside it:
                    "Under leverans" in a quarter-width column had nowhere to
                    go. */}
                <div className="relative pt-1">
                  {/* Track: inset by half a column so it starts and ends at the
                      circle centres instead of the card edges. */}
                  <div
                    className="absolute top-[22px] h-0.5 rounded-full bg-border"
                    style={{
                      left: `${100 / (DELIVERY_STEPS.length * 2)}%`,
                      right: `${100 / (DELIVERY_STEPS.length * 2)}%`,
                    }}
                    aria-hidden
                  />
                  <div
                    className="absolute top-[22px] h-0.5 rounded-full bg-emerald-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{
                      left: `${100 / (DELIVERY_STEPS.length * 2)}%`,
                      width: `calc((100% - ${100 / DELIVERY_STEPS.length}%) * ${
                        DELIVERY_STEPS.length > 1
                          ? Math.min(Math.max(stepIndex, 0), DELIVERY_STEPS.length - 1) /
                            (DELIVERY_STEPS.length - 1)
                          : 0
                      })`,
                    }}
                    aria-hidden
                  />

                  <ol
                    className="relative grid w-full"
                    style={{ gridTemplateColumns: `repeat(${DELIVERY_STEPS.length}, minmax(0, 1fr))` }}
                  >
                    {DELIVERY_STEPS.map((step, i) => {
                      const Icon = step.icon;
                      const isComplete = i < stepIndex;
                      const isCurrent = i === stepIndex;
                      /* One accent colour in three weights — filled for done,
                         outlined-with-ring for current, muted for pending.
                         A second hue for "current" read as a different kind of
                         state rather than a further stage of the same one. */
                      const dot = isComplete
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : isCurrent
                          ? "border-emerald-500 bg-background text-emerald-600 ring-4 ring-emerald-500/15 dark:text-emerald-400"
                          : "border-border bg-background text-muted-foreground/50";
                      /* Only steps whose date we actually know get one. */
                      const when =
                        step.id === "processing"
                          ? order.placedDate
                          : step.id === "shipped"
                            ? preflight?.booked.bookedAt ?? null
                            : null;
                      return (
                        <li
                          key={step.id}
                          className="flex flex-col items-center gap-1.5 text-center"
                          aria-current={isCurrent ? "step" : undefined}
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none ${dot}`}
                          >
                            {isComplete ? (
                              <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                            ) : (
                              <Icon className="h-4 w-4" strokeWidth={isCurrent ? 2.25 : 1.75} />
                            )}
                          </span>
                          <span
                            className={`px-0.5 text-[11px] leading-tight ${
                              isComplete || isCurrent
                                ? "font-medium text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {step.label}
                          </span>
                          {when && (isComplete || isCurrent) && (
                            <span className="text-[10px] leading-none text-muted-foreground">
                              {formatDate(when)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
                </>
                )}
                {/* Fraktbokning. Renders in every state — when booking is not
                    possible it says why, instead of silently disappearing.

                    Separated by a rule and given a heading: it is the one part
                    of this card that *does* something, and it was reading as
                    another status panel. */}
                <div className="border-t pt-3">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Fraktbokning
                  </p>
                <div className="rounded-lg border bg-muted/30 px-3 py-3 text-xs space-y-2">
                  {!preflight ? (
                    <Skeleton className="h-9 w-48 rounded" aria-hidden />
                  ) : !preflight.eligible ? (
                    <p className="text-[11px] text-muted-foreground">
                      {preflight.ineligibleReason?.message ?? "Frakt kan inte bokas för denna order."}
                    </p>
                  ) : preflight.booked.cancelledAt ? (
                    /* Cancelled in PostNord's portal. The tracking id is kept
                       on purpose — the parcel existed and may have been billed. */
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/30 bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          Bokning avbruten
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(preflight.booked.cancelledAt)}
                        </span>
                        {preflight.booked.trackingId && (
                          <span className="font-mono text-[11px] text-muted-foreground break-all">
                            {preflight.booked.trackingId}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Avbokningen gjordes hos PostNord. Boka frakt igen om
                        försändelsen ska skickas ändå.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 bg-white text-xs"
                          onClick={() => setBookingCancelled(false)}
                          disabled={cancelling}
                        >
                          Ångra markeringen
                        </Button>
                      </div>
                    </div>
                  ) : preflight.booked.isBooked ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          Frakt bokad
                        </span>
                        {preflight.booked.testBooking && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            TESTBOKNING
                          </span>
                        )}
                        {preflight.booked.bookedAt && (
                          <span className="text-[11px] text-muted-foreground">
                            {formatDate(preflight.booked.bookedAt)}
                          </span>
                        )}
                        {preflight.booked.weightKg != null && (
                          <span className="text-[11px] text-muted-foreground">
                            Bokad vikt: {preflight.booked.weightKg} kg
                          </span>
                        )}
                      </div>

                      {preflight.booked.trackingId ? (
                        <p className="font-mono text-[11px] break-all">
                          Spårningsnr: {preflight.booked.trackingId}
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-700">
                          Inget spårningsnummer returnerades — hämta det hos PostNord och klistra in det ovan.
                        </p>
                      )}
                      {preflight.booked.printId && (
                        <p className="font-mono text-[11px] text-muted-foreground break-all">
                          PrintId: {preflight.booked.printId}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {preflight.booked.hasLabel && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 bg-white text-xs"
                            onClick={() => setPrintDialogOpen(true)}
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden />
                            Fraktetikett PDF
                          </Button>
                        )}
                        {preflight.booked.trackingId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 bg-white text-xs"
                            onClick={handleSendShipmentEmail}
                            disabled={sendingShipmentEmail}
                            title="Bokningen skickar inget mejl automatiskt"
                          >
                            {sendingShipmentEmail ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Mail className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Skicka leveransmejl
                          </Button>
                        )}
                        <AlertDialog open={confirmRebookOpen} onOpenChange={setConfirmRebookOpen}>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 text-xs">
                              Boka om
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Boka om frakten?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Det gamla spårningsnumret ersätts. Den tidigare bokningen avbokas
                                INTE hos PostNord — det måste göras i PostNords portal.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Avbryt</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  setConfirmRebookOpen(false);
                                  void handlePostnordBook(true);
                                }}
                              >
                                Boka om
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        {/* Records a cancellation already made in PostNord's
                            portal — they have no cancel API, so admin can only
                            be told about it, never do it. */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 bg-white text-xs"
                          onClick={() => setBookingCancelled(true)}
                          disabled={cancelling}
                        >
                          Markera som avbruten
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!preflight.config.ready && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                          <p className="flex items-center gap-1.5 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            PostNord är inte konfigurerat — bokning avstängd
                          </p>
                          <ul className="mt-2 space-y-1">
                            {preflight.config.blocking.map((c) => (
                              <li key={c.key}>
                                <code className="font-mono text-[11px]">{c.key}</code>
                                <span className="text-[11px]"> — {c.hint}</span>
                              </li>
                            ))}
                          </ul>
                          {preflight.config.warnings.length > 0 && (
                            <ul className="mt-2 space-y-1 border-t border-amber-200 pt-2">
                              {preflight.config.warnings.map((w) => (
                                <li key={w.key} className="text-[11px]">
                                  <code className="font-mono">{w.key}</code> — {w.hint}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="postnord-book-weight-kg" className="text-xs">
                            Vikt (kg)
                          </Label>
                          <Input
                            id="postnord-book-weight-kg"
                            type="number"
                            step="0.1"
                            min={0.1}
                            max={35}
                            className="h-9 w-24"
                            value={bookWeightKg}
                            placeholder="—"
                            onChange={(e) => setBookWeightKg(e.target.value)}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 gap-2"
                          disabled={
                            postnordBooking ||
                            (!preflight.config.ready && preflight.config.mode !== "test")
                          }
                          title={
                            !preflight.config.ready && preflight.config.mode !== "test"
                              ? "PostNord är inte konfigurerat"
                              : undefined
                          }
                          onClick={() => void handlePostnordBook(false)}
                        >
                          {postnordBooking ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : null}
                          {postnordBooking
                            ? "Bokar…"
                            : preflight.config.ready
                              ? "Boka frakt"
                              : "Testa mot PostNord ändå"}
                        </Button>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        {preflight.weight.source === "products"
                          ? `Uppskattad från produktvikter (${preflight.weight.suggestedKg} kg).`
                          : "Inga produktvikter registrerade — 1 kg per enhet antaget."}
                        {preflight.weight.missingWeights.length > 0 &&
                          ` Saknar vikt: ${preflight.weight.missingWeights.join(", ")}.`}
                        {preflight.weight.oversize &&
                          " Skrymmande (>120 cm längsta sida) — PostNord kan debitera tilläggsavgift."}
                      </p>
                    </>
                  )}

                  {bookingError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                      <p className="font-medium text-destructive">{bookingError.error}</p>
                      {Boolean(bookingError.details || bookingError.diagnostics) && (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[11px] text-muted-foreground">
                            Teknisk information
                          </summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] whitespace-pre-wrap break-all">
                            {[
                              bookingError.details,
                              bookingError.diagnostics
                                ? JSON.stringify(bookingError.diagnostics, null, 2)
                                : null,
                            ]
                              .filter(Boolean)
                              .join("\n\n")}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                  {order.servicePointId && (
                    <p className="font-mono text-[11px] break-all text-muted-foreground">
                      Ombud: {order.servicePointId}
                      {order.servicePointName ? ` — ${order.servicePointName}` : ""}
                    </p>
                  )}
                </div>

                {/* Utskick. Only rendered once something has actually been
                    sent — an empty log is noise on an order that has not
                    shipped yet. */}
                {/* Orderbekräftelse. Always offered: a staff-created order
                    never sent one automatically, and a customer who bought
                    over the phone still needs their receipt. */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 bg-white text-xs"
                    disabled={sendingConfirmation}
                    onClick={() => void sendOrderConfirmation(false)}
                  >
                    {sendingConfirmation ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    )}
                    {sendingConfirmation ? "Skickar…" : "Skicka orderbekräftelse"}
                  </Button>
                  {!orderEmails.some((m) => m.kind === "order_confirmation" && m.sentAt) && (
                    <span className="text-[11px] text-muted-foreground">
                      Kunden har inte fått någon bekräftelse än.
                    </span>
                  )}
                </div>

                {orderEmails.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Utskick till kund
                    </p>
                    <ul className="space-y-1.5">
                      {orderEmails.map((mail) => {
                        const label = ORDER_EMAIL_LABELS[mail.kind] ?? mail.kind;
                        const failed = !mail.sentAt && mail.error;
                        const pending = !mail.sentAt && !mail.error;
                        return (
                          <li
                            key={mail.kind}
                            className="flex items-start justify-between gap-2 text-[11px]"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${
                                  failed
                                    ? "bg-destructive"
                                    : pending
                                      ? "bg-muted-foreground/40"
                                      : "bg-emerald-500"
                                }`}
                                aria-hidden
                              />
                              <span className="truncate text-foreground">{label}</span>
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {mail.sentAt
                                ? formatDate(mail.sentAt)
                                : failed
                                  ? "misslyckades"
                                  : "skickas…"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {orderEmails.some((m) => m.error) && (
                      <p className="mt-1.5 text-[10px] text-destructive">
                        {orderEmails.find((m) => m.error)?.error}
                      </p>
                    )}
                  </div>
                )}
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
                              href={postNordTrackingUrl(editTrackingId.trim() || toValidTrackingId(order.postNordTrackingId) || "")}
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
                      <>
                        <TrackingIdentifiers
                          data={trackingData}
                          savedId={toValidTrackingId(order.postNordTrackingId)}
                          onUse={(id) => {
                            setEditTrackingId(id);
                            toast.info("Spårningsnummer ifyllt — tryck Spara för att spara det på ordern");
                          }}
                        />
                        <TrackingEvents data={trackingData} />
                      </>
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
                              <img src={resolveImageUrl(item.productImage)} alt={item.productName} className="h-full w-full object-cover" />
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

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Ordersammanfattning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delsumma</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              {(() => {
                /**
                 * VAT as charged, not as assumed.
                 *
                 * This was `(subtotal + shipping) * 0.2` with no country
                 * branch, so a Norwegian order showed Swedish VAT it never
                 * carried — and staff reconciling against Stripe saw a figure
                 * that existed nowhere in the payment.
                 *
                 * Orders placed before migration 0026 have no stored value, so
                 * they fall back to the old arithmetic rather than showing a
                 * blank: for a Swedish order that is exactly what was charged.
                 */
                const isExport = order.vatTreatment === "export_zero_rated";
                const rate = order.vatRate ?? 0.25;
                const amount =
                  order.vatAmount ?? (order.subtotal + order.shipping) * 0.2;
                const label = `Moms (${Math.round(rate * 100)}%)`;

                if (isExport) {
                  return (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Moms</span>
                      <span className="text-right">
                        <span className="font-medium">0 {order.currency ?? "SEK"}</span>
                        <span className="mt-0.5 block text-[11px] leading-tight text-amber-700 dark:text-amber-500">
                          Export utanför EU — ingen svensk moms.
                          <br />
                          Mottagaren betalar importmoms och tull vid leverans.
                        </span>
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {label}
                      {order.vatAmount == null && (
                        <span className="ml-1 text-[10px] text-muted-foreground/70">
                          (beräknad)
                        </span>
                      )}
                    </span>
                    <span>{formatCurrency(amount)}</span>
                  </div>
                );
              })()}
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
              {order.coreKeepFeeSek != null && order.coreKeepFeeSek > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Kärnavgift</span>
                  <span>{formatCurrency(order.coreKeepFeeSek)}</span>
                </div>
              )}
              {order.depositAmount != null && order.depositAmount > 0 && (
                <>
                  <div className="flex justify-between text-amber-700 dark:text-amber-400">
                    <span>Deposition (betald)</span>
                    <span>{formatCurrency(order.depositAmount)}</span>
                  </div>
                  {order.balanceDue != null && order.balanceDue > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Återstod (betalas senare)</span>
                      <span>{formatCurrency(order.balanceDue)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Totalt</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Directly under the money figures, which is what a refund is about. */}
          <RefundSection
            orderId={order.orderId}
            customerEmail={order.customerEmail}
            onRefunded={async () => {
              const refetch = await fetch(`/api/orders/${id}`);
              const updated = await refetch.json();
              setOrder(updated);
              setEditStatus(updated.status ?? "confirmed");
            }}
          />
        </div>
      </div>

      <LabelPrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        orderId={Number(id)}
        orderNumber={order?.orderNumber}
      />
    </div>
  );
}
