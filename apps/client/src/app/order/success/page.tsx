"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Home, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/ui/confetti";
import { createOrder, fetchOrder } from "@/lib/api";
import useCartStore from "@/stores/cartStore";
import { useLanguage, useTranslation } from "@/i18n/context";

function OrderSuccessContent() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = useTranslation();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const orderIdParam = searchParams.get("orderId");
  const orderTokenParam = searchParams.get("token");
  const totalParam = searchParams.get("total");
  const [paymentIntent, setPaymentIntent] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    total: number;
    createdAt: Date;
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
    let payload: Parameters<typeof createOrder>[0];
    try {
      payload = JSON.parse(raw);
    } catch {
      setPendingCreate(false);
      return;
    }
    const totalNum = Number(payload.total);
    setOrderDetails({ total: totalNum, createdAt: new Date() });
    try {
      sessionStorage.setItem("orderSuccessTotal", String(totalNum));
    } catch { /* non-blocking */ }
    createOrder({ ...payload, stripePaymentId: paymentIntent })
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
          setOrderDetails({ total: order.total, createdAt: new Date(order.createdAt) });
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
          </div>

          <hr className="my-6 border-border" />

          <div className="space-y-3 text-sm">
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
