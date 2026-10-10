"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Box,
  CheckCircle,
  Clock,
  ExternalLink,
  HelpCircle,
  Home,
  Loader2,
  Mail,
  MapPin,
  Package,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@repo/ui/components/button";
import { Confetti } from "@repo/ui/components/confetti";
import { createOrder, fetchOrder } from "@/lib/api";
import useCartStore from "@/stores/cartStore";
import { useLanguage, useTranslation } from "@/i18n/context";
import { completePostNordSessionFromCheckoutPayload } from "@/lib/complete-postnord-session";
import type { PendingOrderPayload } from "@/components/PaymentForm";
import {
  formatAmount,
  normalizeCurrency,
  type SupportedCurrency,
} from "@repo/currency";

const POSTNORD_TRACKING_BASE =
  "https://www.postnord.se/vara-verktyg/spara-din-forsandelse";

/**
 * What actually happened to the payment.
 *
 * This page is the single `return_url` for every Stripe payment method, so it
 * receives the customer back whether they paid, cancelled, or were declined.
 * It used to read only `redirect_status` from the URL and use it to decide
 * whether to CREATE the order — never what to RENDER — so a cancelled Klarna
 * payment fell through to the success markup: confetti, "Betalning genomförd",
 * and a claim that a confirmation email had been sent. Nothing had been paid.
 *
 * Two rules follow from that, and both matter:
 *
 *   1. The status comes from Stripe, not from the URL. `redirect_status` is a
 *      query parameter — anyone can type `?redirect_status=succeeded`. We ask
 *      Stripe what the PaymentIntent's real status is instead.
 *   2. "checking" is the default, so success is never the fall-through. Any
 *      path that fails to prove a payment lands on a neutral screen, not on a
 *      receipt.
 */
type PaymentOutcome =
  | "checking"
  | "succeeded"
  | "processing"
  /** Declined, cancelled at the provider, or authentication abandoned. */
  | "failed"
  /** No payment to show: a bare URL or a stale bookmark. */
  | "unknown"
  /**
   * A payment was in flight but we could not reach Stripe to ask about it.
   *
   * Distinct from "unknown" on purpose. Telling someone who just paid that
   * there is "no payment to show" would be alarming and wrong; the honest
   * message is that we cannot confirm it from here. Ad blockers routinely
   * block js.stripe.com, so this is a real state, not a theoretical one.
   */
  | "unverified";

/** Nothing on this page may wait forever; see LOOKUP_TIMEOUT_MS usage. */
const LOOKUP_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

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
  const [outcome, setOutcome] = useState<PaymentOutcome>("checking");
  /**
   * `redirect_pm_type`, which Stripe appends for redirect-based methods. Lets
   * the receipt say "Klarna" instead of calling every order a card payment.
   */
  const [redirectMethod, setRedirectMethod] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    total: number;
    createdAt: Date;
    orderNumber?: string | null;
    email?: string | null;
    servicePointName?: string | null;
  } | null>(null);
  /**
   * Currency the order was charged in, carried over from checkout. A receipt
   * must name what was actually paid; converting it at today's rate would make
   * the page disagree with the customer's bank statement.
   */
  const [orderCurrency, setOrderCurrency] = useState<SupportedCurrency>("SEK");
  const [clientTotal, setClientTotal] = useState<number | null>(null);
  const clearCart = useCartStore((s) => s.clearCart);

  const dateLocale = locale === "en" ? "en-GB" : "sv-SE";

  /**
   * A guest's only route back to their order: the view token is what authorises
   * the read, so the link has to carry it. Relative on purpose — the page is
   * server-rendered first, and reading `window.location` here would break that.
   */
  const guestOrderPath =
    !session && orderIdParam && orderTokenParam
      ? `/order/success?orderId=${encodeURIComponent(orderIdParam)}&token=${encodeURIComponent(orderTokenParam)}`
      : null;

  // Capture total from URL (direct flow) or sessionStorage (Stripe redirect)
  useEffect(() => {
    if (pendingCreate || createError) return;
    const fromUrl = totalParam ? parseFloat(totalParam) : NaN;
    let fromStorage = NaN;
    try {
      const s = sessionStorage.getItem("orderSuccessTotal");
      if (s) fromStorage = parseFloat(s);
    } catch {
      /* ignore */
    }
    const total = !isNaN(fromUrl)
      ? fromUrl
      : !isNaN(fromStorage)
        ? fromStorage
        : NaN;
    if (!isNaN(total)) {
      setOrderDetails({ total, createdAt: new Date() });
    }
    try {
      const stored = sessionStorage.getItem("orderSuccessCurrency");
      if (stored) setOrderCurrency(normalizeCurrency(stored));
    } catch {
      /* ignore */
    }
  }, [totalParam, pendingCreate, createError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // Stripe puts these in the query string, but some methods return them in
    // the fragment instead, so both are checked.
    const param = (key: string): string | null => {
      const fromQuery = searchParams.get(key);
      if (fromQuery) return fromQuery;
      if (!window.location.hash) return null;
      return new URLSearchParams(window.location.hash.slice(1)).get(key);
    };

    const pi = param("payment_intent");
    const clientSecret = param("payment_intent_client_secret");
    if (pi) setPaymentIntent(pi);
    setRedirectMethod(param("redirect_pm_type"));

    // Not a Stripe return. The inline card flow routes here with ?orderId once
    // the order already exists, and that is proof enough; anything else (a
    // bookmark, a typed URL) has no payment behind it and must not claim one.
    if (!clientSecret) {
      setOutcome(orderIdParam || totalParam ? "succeeded" : "unknown");
      return;
    }

    (async () => {
      try {
        // The whole lookup is time-boxed. `loadStripe` never settles when
        // js.stripe.com is blocked — by an ad blocker, a corporate proxy, or an
        // outage — and an un-timed await there leaves the customer staring at a
        // spinner forever, which is a worse outcome than the bug this fixes.
        const intent = await withTimeout(
          (async () => {
            const res = await fetch("/api/stripe/config", {
              signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
            });
            const data = (await res.json()) as {
              publishableKey?: string;
              error?: string;
            };
            if (!data.publishableKey) {
              throw new Error(data.error ?? "no Stripe key");
            }
            const stripe = await loadStripe(data.publishableKey);
            if (!stripe) throw new Error("Stripe.js failed to load");
            const result = await stripe.retrievePaymentIntent(clientSecret);
            if (result.error)
              throw new Error(result.error.message ?? "lookup failed");
            return result.paymentIntent;
          })(),
          LOOKUP_TIMEOUT_MS,
        );
        if (cancelled) return;

        // Statuses per docs.stripe.com/payments/payment-intents/verifying-status.
        // A cancelled or declined attempt returns the intent to
        // `requires_payment_method`; an abandoned authentication leaves it at
        // `requires_action`. Neither is a sale.
        switch (intent?.status) {
          case "succeeded":
            setOutcome("succeeded");
            if (sessionStorage.getItem("pendingStripeOrder")) {
              setPendingCreate(true);
            }
            break;
          case "processing":
            setOutcome("processing");
            break;
          default:
            setOutcome("failed");
            // The snapshot describes a checkout that never happened. Leaving it
            // behind would let a later visit to this page try to create an
            // order for an unpaid intent.
            try {
              sessionStorage.removeItem("pendingStripeOrder");
            } catch {
              /* non-blocking */
            }
            break;
        }
      } catch {
        // Timed out, blocked, or the client secret was not real. We cannot
        // claim success, and we must not claim failure either — the money may
        // well have been taken.
        if (!cancelled) setOutcome("unverified");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, orderIdParam, totalParam]);

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
    // The server-quoted charge when checkout recorded one, otherwise the
    // client estimate — the same precedence the cart's own summary used.
    const totalNum = Number(payload.chargedTotal ?? payload.total);
    const currency = normalizeCurrency(payload.currency);
    setOrderDetails({ total: totalNum, createdAt: new Date() });
    setOrderCurrency(currency);
    try {
      sessionStorage.setItem("orderSuccessTotal", String(totalNum));
      sessionStorage.setItem("orderSuccessCurrency", currency);
    } catch {
      /* non-blocking */
    }

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
        if (order.postNordTrackingId)
          params.set("tracking", order.postNordTrackingId);
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
    // A guest has no userId, so the view token is the only thing that
    // authorises this read — without it the receipt renders with no order
    // number, no confirmation address and no pickup point.
    fetchOrder(id, userId, orderTokenParam)
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
      .catch(() => {
        /* ignore - use fallbacks */
      });
  }, [
    orderIdParam,
    orderTokenParam,
    session?.user?.id,
    pendingCreate,
    createError,
  ]);

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
    } catch {
      /* ignore */
    }
  }, [clientTotal]);

  const formattedDate = useMemo(() => {
    const d = orderDetails?.createdAt ?? new Date();
    return d.toLocaleString(dateLocale, {
      dateStyle: "long",
      timeStyle: "short",
    });
  }, [orderDetails?.createdAt, dateLocale]);

  // Order matters below: every non-success outcome returns before the receipt
  // markup, so no path can reach it by falling through.

  if (outcome === "checking") {
    return (
      <div className="w-full max-w-lg mx-auto mt-12 mb-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">
          {t("orderSuccess.verifyingPayment")}
        </p>
      </div>
    );
  }

  if (pendingCreate) {
    return (
      <div className="w-full max-w-lg mx-auto mt-12 mb-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">
          {t("orderSuccess.completingOrder")}
        </p>
      </div>
    );
  }

  if (outcome === "failed") {
    return (
      <div className="w-full max-w-lg mx-auto mt-12 mb-16">
        <div className="bg-card border rounded-xl p-8 shadow-sm text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mb-6">
            <XCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">
            {t("orderSuccess.failedTitle")}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {t("orderSuccess.failedBody")}
          </p>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            {t("orderSuccess.failedCartIntact")}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/cart">
              <Button className="w-full sm:w-auto">
                <ArrowRight className="w-4 h-4" />
                {t("orderSuccess.tryAgain")}
              </Button>
            </Link>
            <Link href="/products">
              <Button variant="outline" className="w-full sm:w-auto">
                <ShoppingBag className="w-4 h-4" />
                {t("orderSuccess.continueShopping")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (outcome === "processing") {
    return (
      <div className="w-full max-w-lg mx-auto mt-12 mb-16">
        <div className="bg-card border rounded-xl p-8 shadow-sm text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-6">
            <Clock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">
            {t("orderSuccess.processingTitle")}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {t("orderSuccess.processingBody")}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {session && (
              <Link href="/account">
                <Button className="w-full sm:w-auto">
                  {t("orderSuccess.viewOrderHistory")}
                </Button>
              </Link>
            )}
            <Link href="/">
              <Button variant="outline" className="w-full sm:w-auto">
                <Home className="w-4 h-4" />
                {t("orderSuccess.backToHome")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (outcome === "unverified") {
    return (
      <div className="w-full max-w-lg mx-auto mt-12 mb-16">
        <div className="bg-card border rounded-xl p-8 shadow-sm text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground mb-6">
            <HelpCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">
            {t("orderSuccess.unverifiedTitle")}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {t("orderSuccess.unverifiedBody")}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {session && (
              <Link href="/account">
                <Button className="w-full sm:w-auto">
                  {t("orderSuccess.viewOrderHistory")}
                </Button>
              </Link>
            )}
            <Link href="/">
              <Button variant="outline" className="w-full sm:w-auto">
                <Home className="w-4 h-4" />
                {t("orderSuccess.backToHome")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (outcome === "unknown") {
    return (
      <div className="w-full max-w-lg mx-auto mt-12 mb-16">
        <div className="bg-card border rounded-xl p-8 shadow-sm text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground mb-6">
            <Package className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">
            {t("orderSuccess.unconfirmedTitle")}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {t(
              session
                ? "orderSuccess.unconfirmedBody"
                : "orderSuccess.unconfirmedBodyGuest",
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {session && (
              <Link href="/account">
                <Button className="w-full sm:w-auto">
                  {t("orderSuccess.viewOrderHistory")}
                </Button>
              </Link>
            )}
            <Link href="/">
              <Button variant="outline" className="w-full sm:w-auto">
                <Home className="w-4 h-4" />
                {t("orderSuccess.backToHome")}
              </Button>
            </Link>
          </div>
        </div>
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
    totalFromUrl ??
    totalFromWindow ??
    totalFromStorage;
  const isValidTotal = totalDisplay !== null && !isNaN(totalDisplay);
  const trackingId = trackingParam?.trim() ?? "";
  const postNordTrackingUrl = trackingId
    ? `${POSTNORD_TRACKING_BASE}?shipmentId=${encodeURIComponent(trackingId)}`
    : null;

  const displayOrderNumber =
    orderDetails?.orderNumber?.trim().replace(/^#+/u, "") || null;
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
      <Confetti className="fixed inset-0 z-50 size-full pointer-events-none" />
      <div className="w-full max-w-lg mx-auto mt-12 mb-16">
        <div className="bg-card border rounded-xl p-8 shadow-sm">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-6">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">
              {t("orderSuccess.title")}
            </h1>
            <p className="text-muted-foreground">{t("orderSuccess.message")}</p>
            <p className="mt-3 inline-flex items-start gap-2 text-sm text-muted-foreground">
              <Mail
                className="mt-0.5 h-4 w-4 shrink-0 opacity-80"
                aria-hidden
              />
              <span className="text-left">{emailConfirmationText}</span>
            </p>
          </div>

          <hr className="my-6 border-border" />

          <div className="space-y-3 text-sm">
            {displayOrderNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("orderSuccess.orderNumberLabel")}
                </span>
                <span className="font-mono font-medium">
                  #{displayOrderNumber}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("orderSuccess.amountPaid")}
              </span>
              <span className="font-medium">
                {isValidTotal
                  ? formatAmount(Number(totalDisplay), orderCurrency)
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("orderSuccess.paymentMethod")}
              </span>
              <span className="font-medium capitalize">
                {redirectMethod ?? t("orderSuccess.paymentMethodCard")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("orderSuccess.dateTime")}
              </span>
              <span className="font-medium">{formattedDate}</span>
            </div>
          </div>

          {displayServicePoint && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
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
                      <Icon
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden
                      />
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
                <Button
                  variant="outline"
                  size="sm"
                  className="border-sky-300/80 bg-white/80 hover:bg-sky-100/80 dark:border-sky-800 dark:bg-sky-950/50"
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  {t("orderSuccess.trackAtPostNord")}
                </Button>
              </a>
              <p className="text-xs leading-snug text-muted-foreground">
                {t("orderDetail.trackingStatusHint")}
              </p>
            </div>
          )}

          {!session && (
            <div className="mt-6 rounded-lg border bg-muted/30 px-4 py-4 text-sm">
              <p className="font-medium">
                {t("orderSuccess.createAccountNudge")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("orderSuccess.createAccountNudgeDesc")}
              </p>
              <Link href="/logga-in?mode=register" className="mt-3 inline-flex">
                <Button variant="outline" size="sm">
                  {t("auth.createAccount")}
                </Button>
              </Link>
            </div>
          )}

          <div className="mt-6 flex flex-row gap-3">
            <Link href="/" className="flex-1">
              <Button
                variant="outline"
                className="w-full justify-between group"
              >
                <span className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  {t("orderSuccess.backToHome")}
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            {session ? (
              <Link href="/account" className="flex-1">
                <Button className="w-full">
                  {t("orderSuccess.viewOrderHistory")}
                </Button>
              </Link>
            ) : guestOrderPath ? (
              <Link href={guestOrderPath} className="flex-1">
                <Button className="w-full">
                  {t("orderSuccess.viewOrderAsGuest")}
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default function OrderSuccessPage() {
  const t = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-lg mx-auto mt-12 mb-16 text-center text-muted-foreground">
          {t("common.loading")}
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
