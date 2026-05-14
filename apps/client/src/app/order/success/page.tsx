"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Box,
  CheckCircle,
  ExternalLink,
  Home,
  Loader2,
  Mail,
  MapPin,
  Package,
  Truck,
} from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Confetti } from "@repo/ui/components/confetti";
import { createOrder, fetchOrder } from "@/lib/api";
import useCartStore from "@/stores/cartStore";
import { useLanguage, useTranslation } from "@/i18n/context";
import { completePostNordSessionFromCheckoutPayload } from "@/lib/complete-postnord-session";
import type { PendingOrderPayload } from "@/components/PaymentForm";

const POSTNORD_TRACKING_BASE =
  "https://www.postnord.se/vara-verktyg/spara-din-forsandelse";

function OrderSuccessContent() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = useTranslation();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const orderIdParam = searchParams.get("orderId");
  const orderTokenParam = searchParams.get("token");
  const totalParam = searchParams.get("total");
  const trackingParam = searchParams.get("tracking");
  const [paymentIntent, setPaymentIntent] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    total: number;
    createdAt: Date;
    orderNumber?: string | null;
    email?: string | null;
    servicePointName?: string | null;
  } | null>(null);
  const [clientTotal, setClientTotal] = useState<number | null>(null);
  const clearCart = useCartStore((s) => s.clearCart);

  const dateLocale = locale === "en" ? "en-GB" : "sv-SE";

  // Capture total from URL (direct flow) or sessionStorage (Stripe redirect)
  useEffect(() => {
    if (pendingCreate || createError) return;
    const fromUrl = totalParam ? parseFloat(totalParam) : NaN;
    let fromStorage = NaN;
    try {
      const s = sessionStorage.getItem("orderSuccessTotal");
      if (s) fromStorage = parseFloat(s);
    } catch { /* ignore */ }
    const total = !isNaN(fromUrl) ? fromUrl : !isNaN(fromStorage) ? fromStorage : NaN;
    if (!isNaN(total)) {
      setOrderDetails({ total, createdAt: new Date() });
    }
  }, [totalParam, pendingCreate, createError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let pi = searchParams.get("payment_intent");
    let status = searchParams.get("redirect_status");
    if (!pi && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      pi = hashParams.get("payment_intent");
      status = hashParams.get("redirect_status");
    }
    if (pi) setPaymentIntent(pi);
    const hasPending = !!sessionStorage.getItem("pendingStripeOrder");
    if (pi && status === "succeeded" && hasPending) {
      setPendingCreate(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!pendingCreate || !paymentIntent) return;
    const raw = sessionStorage.getItem("pendingStripeOrder");
    if (!raw) {
      setPendingCreate(false);
      return;
    }
    let payload: PendingOrderPayload;
    try {
      payload = JSON.parse(raw) as PendingOrderPayload;
    } catch {
      setPendingCreate(false);
      return;
    }
    const totalNum = Number(payload.total);
    setOrderDetails({ total: totalNum, createdAt: new Date() });
    try {
      sessionStorage.setItem("orderSuccessTotal", String(totalNum));
    } catch { /* non-blocking */ }

    (async () => {
      let postNordTrackingId = payload.postNordTrackingId ?? null;
      if (!postNordTrackingId && payload.postNordSessionId) {
        postNordTrackingId = await completePostNordSessionFromCheckoutPayload({
          postNordSessionId: payload.postNordSessionId,
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          phone: payload.phone,
          address: payload.address,
          city: payload.city,
          postalCode: payload.postalCode,
          country: payload.country,
        });
      }
      const { postNordSessionId: _sn, ...orderPayload } = payload;
      void _sn;
      return createOrder({
        ...orderPayload,
        stripePaymentId: paymentIntent,
        postNordTrackingId: postNordTrackingId ?? undefined,
      });
    })()
      .then((order) => {
        sessionStorage.removeItem("pendingStripeOrder");
        clearCart();
        const params = new URLSearchParams();
        params.set("orderId", String(order.id));
        if (order.postNordTrackingId) params.set("tracking", order.postNordTrackingId);
        params.set("total", String(totalNum));
        if (order.viewToken) params.set("token", order.viewToken);
        router.replace(`/order/success?${params.toString()}`);
        setPendingCreate(false);
      })
      .catch((err) => {
        setCreateError(err.message ?? t("orderSuccess.createOrderFailed"));
        setPendingCreate(false);
      });
  }, [pendingCreate, paymentIntent, clearCart, router, t]);

  // Fetch order from API when we have orderId (most reliable source for total)
  useEffect(() => {
    if (pendingCreate || createError) return;
    const id = orderIdParam ? parseInt(orderIdParam, 10) : NaN;
    if (isNaN(id)) return;
    const userId = session?.user?.id ?? "";
    fetchOrder(id, userId)
      .then((order) => {
        if (order) {
          setOrderDetails({
            total: order.total,
            createdAt: new Date(order.createdAt),
            orderNumber: order.orderNumber ?? null,
            email: order.email ?? null,
            servicePointName: order.servicePointName ?? null,
          });
        }
      })
      .catch(() => { /* ignore - use fallbacks */ });
  }, [orderIdParam, orderTokenParam, session?.user?.id, pendingCreate, createError]);

  // Read total from window/sessionStorage on client (runs after hydration)
  useEffect(() => {
    if (clientTotal != null) return;
    try {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("total");
      if (t) {
        const n = parseFloat(t);
        if (!isNaN(n)) {
          setClientTotal(n);
          return;
        }
      }
      const s = sessionStorage.getItem("orderSuccessTotal");
      if (s) {
        const n = parseFloat(s);
        if (!isNaN(n)) setClientTotal(n);
      }
    } catch { /* ignore */ }
  }, [clientTotal]);

  const formattedDate = useMemo(() => {
    const d = orderDetails?.createdAt ?? new Date();
    return d.toLocaleString(dateLocale, {
      dateStyle: "long",
      timeStyle: "short",
    });
  }, [orderDetails?.createdAt, dateLocale]);

  if (pendingCreate) {
    return (
      <div className="w-full max-w-lg mx-auto mt-12 mb-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">{t("orderSuccess.completingOrder")}</p>
      </div>
    );
  }

  if (createError) {
    return (
      <div className="w-full max-w-lg mx-auto mt-12 mb-16">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-8 text-center">
          <p className="text-red-800 dark:text-red-200 mb-4">{createError}</p>
          <Link href="/cart">
            <Button>{t("orderSuccess.backToCart")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalFromUrl = totalParam ? parseFloat(totalParam) : null;
  const totalFromWindow =
    typeof window !== "undefined"
      ? (() => {
          try {
            const t = new URLSearchParams(window.location.search).get("total");
            return t ? parseFloat(t) : null;
          } catch {
            return null;
          }
        })()
      : null;
  const totalFromStorage =
    typeof window !== "undefined"
      ? (() => {
          try {
            const s = sessionStorage.getItem("orderSuccessTotal");
            return s ? parseFloat(s) : null;
          } catch {
            return null;
          }
        })()
      : null;
  const totalDisplay =
    orderDetails?.total ??
    clientTotal ??
    (totalFromUrl ?? totalFromWindow ?? totalFromStorage);
  const isValidTotal = totalDisplay !== null && !isNaN(totalDisplay);
  const trackingId = trackingParam?.trim() ?? "";
  const postNordTrackingUrl = trackingId
    ? `${POSTNORD_TRACKING_BASE}?shipmentId=${encodeURIComponent(trackingId)}`
    : null;

  const displayOrderNumber = orderDetails?.orderNumber?.trim() || null;
  const displayEmail = orderDetails?.email?.trim() || null;
  const displayServicePoint = orderDetails?.servicePointName?.trim() || null;
  const emailConfirmationText = displayEmail
    ? t("orderSuccess.emailConfirmation", { email: displayEmail })
    : t("orderSuccess.emailConfirmationFallback");

  const nextSteps: Array<{
    icon: typeof Mail;
    title: string;
    body: string;
  }> = [
    {
      icon: Mail,
      title: t("orderSuccess.nextStep1Title"),
      body: t("orderSuccess.nextStep1Body"),
    },
    {
      icon: Box,
      title: t("orderSuccess.nextStep2Title"),
      body: t("orderSuccess.nextStep2Body"),
    },
    {
      icon: Truck,
      title: t("orderSuccess.nextStep3Title"),
      body: t("orderSuccess.nextStep3Body"),
    },
  ];

  return (
    <>
      <Confetti
        className="fixed inset-0 z-50 size-full pointer-events-none"
      />
      <div className="w-full max-w-lg mx-auto mt-12 mb-16">
        <div className="bg-card border rounded-xl p-8 shadow-sm">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-6">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">{t("orderSuccess.title")}</h1>
            <p className="text-muted-foreground">
              {t("orderSuccess.message")}
            </p>
            <p className="mt-3 inline-flex items-start gap-2 text-sm text-muted-foreground">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
              <span className="text-left">{emailConfirmationText}</span>
            </p>
          </div>

          <hr className="my-6 border-border" />

          <div className="space-y-3 text-sm">
            {displayOrderNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("orderSuccess.orderNumberLabel")}</span>
                <span className="font-mono font-medium">#{displayOrderNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("orderSuccess.amountPaid")}</span>
              <span className="font-medium">
                {isValidTotal ? `${Number(totalDisplay).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} kr` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("orderSuccess.paymentMethod")}</span>
              <span className="font-medium">{t("orderSuccess.paymentMethodCard")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("orderSuccess.dateTime")}</span>
              <span className="font-medium">{formattedDate}</span>
            </div>
          </div>

          {displayServicePoint && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("orderSuccess.servicePointLabel")}
                </p>
                <p className="mt-0.5 truncate font-medium text-foreground">
                  {displayServicePoint}
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-lg border bg-card px-4 py-4">
            <p className="mb-3 text-sm font-medium text-foreground">
              {t("orderSuccess.nextStepsTitle")}
            </p>
            <ol className="space-y-3">
              {nextSteps.map(({ icon: Icon, title, body }, idx) => (
                <li key={title} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {postNordTrackingUrl && (
            <div className="mt-6 rounded-lg border border-sky-200/90 bg-sky-50/70 px-4 py-3 text-sm dark:border-sky-900/60 dark:bg-sky-950/30">
              <div className="mb-2 flex items-center gap-2 font-medium text-sky-950 dark:text-sky-100">
                <Package className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                {t("orderDetail.trackDelivery")}
              </div>
              <p className="mb-3 font-mono text-xs text-sky-900/90 dark:text-sky-200/90 break-all">
                {trackingId}
              </p>
              <a
                href={postNordTrackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 inline-flex"
              >
                <Button variant="outline" size="sm" className="border-sky-300/80 bg-white/80 hover:bg-sky-100/80 dark:border-sky-800 dark:bg-sky-950/50">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  {t("orderSuccess.trackAtPostNord")}
                </Button>
              </a>
              <p className="text-xs leading-snug text-muted-foreground">
                {t("orderDetail.trackingStatusHint")}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-row gap-3">
            <Link href="/" className="flex-1">
              <Button variant="outline" className="w-full justify-between group">
                <span className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  {t("orderSuccess.backToHome")}
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/account" className="flex-1">
              <Button className="w-full">{t("orderSuccess.viewOrderHistory")}</Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default function OrderSuccessPage() {
  const t = useTranslation();
  return (
    <Suspense fallback={<div className="w-full max-w-lg mx-auto mt-12 mb-16 text-center text-muted-foreground">{t("common.loading")}</div>}>
      <OrderSuccessContent />
    </Suspense>
  );
}
