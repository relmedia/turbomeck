"use client";

import { useSession, signOut } from "next-auth/react";
import { useLanguage, useTranslation } from "@/i18n/context";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import {
  Package,
  ExternalLink,
  ShoppingBag,
  CreditCard,
  MapPin,
  Heart,
  Trash2,
  Camera,
  Loader2,
  AlertTriangle,
  FileText,
  Download,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AccountToolbar } from "@/app/account/AccountToolbar";
import AddressEditForm from "@/components/AddressEditForm";
import { fetchOrders, fetchProductsByIds, type Order } from "@/lib/api";
import OrderDetailModal from "@/components/OrderDetailModal";
import OrderReviewsModal from "@/components/OrderReviewsModal";
import { type SavedAddress } from "@/types";
import { useWishlist } from "@/hooks/useWishlist";
import { cn, normalizeShopOrderNumber, productUrl } from "@/lib/utils";

const POSTNORD_TRACKING_BASE =
  "https://www.postnord.se/vara-verktyg/spara-din-forsandelse";

function getMemberSince(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === "en" ? "en-GB" : "sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string | null;
  savedAddress?: SavedAddress;
  hasPassword?: boolean;
};

export default function AccountPage() {
  const { locale } = useLanguage();
  const t = useTranslation();
  const searchParams = useSearchParams();

  function orderStatusLabel(s: string) {
    if (s === "confirmed") return t("account.orderStatusConfirmed");
    if (s === "deposit_paid") return t("account.orderStatusDepositPaid");
    if (s === "shipped") return t("account.orderStatusShipped");
    if (s === "delivered") return t("account.orderStatusDelivered");
    if (s === "completed") return t("account.orderStatusCompleted");
    if (s === "cancelled") return t("account.orderStatusCancelled");
    return s;
  }

  /** Matches order detail modal palette: warm processing, blue in transit, green done. */
  function orderStatusBadgeClass(s: string): string {
    switch (s) {
      case "confirmed":
      case "deposit_paid":
        return "border-amber-500/30 bg-amber-500/12 text-amber-950 dark:border-amber-400/35 dark:bg-amber-400/15 dark:text-amber-100";
      case "shipped":
        return "border-sky-500/30 bg-sky-500/12 text-sky-950 dark:border-sky-400/35 dark:bg-sky-400/15 dark:text-sky-100";
      case "delivered":
      case "completed":
        return "border-emerald-500/30 bg-emerald-500/12 text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-400/15 dark:text-emerald-100";
      case "cancelled":
        return "border-rose-500/35 bg-rose-500/12 text-rose-950 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-100";
      default:
        return "border-border bg-muted/70 text-muted-foreground";
    }
  }
  const { data: session, status, update: updateSession } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [wishlistProducts, setWishlistProducts] = useState<Awaited<ReturnType<typeof fetchProductsByIds>>>([]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [orderStripeReceipts, setOrderStripeReceipts] = useState<
    Record<string, { receiptUrl: string | null; receiptNumber: string | null }>
  >({});
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteForm, setDeleteForm] = useState({ password: "", confirmText: "" });
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const { wishlist, toggle: toggleWishlist } = useWishlist();

  const savedAddress = profile?.savedAddress;

  const handleExportData = async () => {
    setExportLoading(true);
    setExportError(null);
    try {
      const res = await fetch("/api/account/export-data");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("account.exportError"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t("account.exportFilename")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportModalOpen(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    const confirmPhrase = t("account.deleteConfirmPhrase");
    if (deleteForm.confirmText !== confirmPhrase) {
      setDeleteError(t("account.deleteConfirmError", { phrase: confirmPhrase }));
      return;
    }
    setDeleteSubmitting(true);
    try {
      const res = await fetch("/api/account/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: profile?.hasPassword ? deleteForm.password : undefined,
          confirmText: deleteForm.confirmText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? t("account.deleteAccountError"));
        return;
      }
      setDeleteModalOpen(false);
      await signOut({ callbackUrl: "/" });
    } catch {
      setDeleteError(t("account.networkError"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const profileRes = await fetch(`/api/user/me`);
        const profileData = profileRes.ok ? await profileRes.json() : null;
        if (!cancelled && profileData) {
          setProfile(profileData);
          const addr = profileData?.savedAddress;
          const full =
            addr?.firstName && addr?.lastName
              ? `${addr.firstName} ${addr.lastName}`.trim()
              : null;
          if (full && profileData?.name !== full) {
            fetch("/api/account/sync-name", { method: "POST" }).catch(() => {});
          }
        }
      } catch {
        /* profile optional for orders list */
      }
      try {
        const ordersData = await fetchOrders();
        if (!cancelled) {
          setOrders(Array.isArray(ordersData) ? ordersData : []);
        }
      } catch (e) {
        console.error("[account] Failed to fetch orders", e);
        if (!cancelled) setOrders([]);
      }
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id]);

  useEffect(() => {
    if (wishlist.length === 0) {
      setWishlistProducts([]);
      return;
    }
    fetchProductsByIds(wishlist).then(setWishlistProducts);
  }, [wishlist.join(",")]);

  useEffect(() => {
    if (loading) return;
    const section = searchParams.get("section");
    if (section === "password") {
      window.history.replaceState({}, "", "/account");
      return;
    }
    if (section === "address") {
      setAddressModalOpen(true);
      window.history.replaceState({}, "", "/account");
    }
  }, [searchParams, loading]);

  useEffect(() => {
    const paidOrders = orders.filter((o) => o.stripePaymentId);
    if (paidOrders.length === 0) return;
    const fetchAll = async () => {
      const map: Record<string, { receiptUrl: string | null; receiptNumber: string | null }> = {};
      await Promise.all(
        paidOrders.map(async (o) => {
          if (!o.stripePaymentId) return;
          try {
            const res = await fetch(
              `/api/stripe/receipt-url?paymentIntentId=${encodeURIComponent(o.stripePaymentId)}`
            );
            const data = (await res.json()) as {
              receiptUrl?: string | null;
              receiptNumber?: string | null;
            };
            const num =
              typeof data.receiptNumber === "string" && data.receiptNumber.trim()
                ? data.receiptNumber.replace(/^#/, "").trim()
                : null;
            map[o.id.toString()] = {
              receiptUrl: data.receiptUrl ?? null,
              receiptNumber: num,
            };
          } catch {
            map[o.id.toString()] = { receiptUrl: null, receiptNumber: null };
          }
        })
      );
      setOrderStripeReceipts((prev) => ({ ...prev, ...map }));
    };
    fetchAll();
  }, [orders.map((o) => o.id).join(",")]);

  const refreshProfile = () => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then(setProfile);
  };

  const avatarImage = profile?.image ?? session?.user?.image;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? t("account.uploadError"));
      }
      refreshProfile();
      await updateSession?.({ image: data.image });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : t("account.somethingWentWrong"));
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  };

  if (status === "loading") {
    return (
      <div className="w-full mt-12 flex justify-center">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="w-full mt-12 max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
            <p className="text-sm text-muted-foreground">
              Logga in för att se dina beställningar och kontoinställningar.
            </p>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>{t("auth.login")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSpent = orders.reduce((sum, o) => sum + Number(o.total ?? 0), 0);
  const deliveredCount = orders.filter(
    (o) => o.status === "delivered" || o.status === "shipped"
  ).length;
  const lastActivityOrder = orders[0];
  const lastActivityText = lastActivityOrder
    ? (() => {
        const d = new Date(lastActivityOrder.createdAt);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return t("account.today");
        if (diffDays === 1) return t("account.yesterday");
        if (diffDays < 7) return t("account.daysAgo", { days: diffDays });
        return d.toLocaleDateString(locale === "en" ? "en-GB" : "sv-SE", { day: "numeric", month: "short" });
      })()
    : "—";

  const displayName = profile?.name ?? session.user.name ?? "—";
  const displayFullName =
    savedAddress?.firstName && savedAddress?.lastName
      ? `${savedAddress.firstName} ${savedAddress.lastName}`.trim()
      : displayName;
  const displayEmail = profile?.email ?? session.user.email ?? "—";

  return (
    <div className="w-full mt-8 mb-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("account.profile")}</h1>
        <AccountToolbar
          onOpenAddress={() => setAddressModalOpen(true)}
          onOpenExport={() => {
            setExportModalOpen(true);
            setExportError(null);
          }}
          onOpenDelete={() => {
            setDeleteModalOpen(true);
            setDeleteError(null);
            setDeleteForm({ password: "", confirmText: "" });
          }}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card className="flex flex-col items-center text-center">
            <CardContent className="pt-6 w-full flex flex-col items-center">
              <label className="relative w-24 h-24 rounded-full shrink-0 mb-4 cursor-pointer group">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="sr-only"
                  onChange={handleAvatarChange}
                  disabled={avatarUploading}
                />
                <Avatar className="size-24 overflow-hidden">
                  <AvatarImage src={avatarImage ?? undefined} alt={t("account.profileImageAlt")} />
                  <AvatarFallback className="text-lg">
                    {(() => {
                      const fn = displayFullName ?? "";
                      const em = displayEmail ?? "";
                      if (fn && fn !== "—") {
                        return fn.split(/\s+/).filter(Boolean).map((s) => s[0]).join("");
                      }
                      if (em && em !== "—") return em[0] ?? "?";
                      return "?";
                    })().toUpperCase().slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <span
                  className="absolute right-0 bottom-0 z-10 size-4 rounded-full border-2 border-background bg-green-600 dark:bg-green-800"
                  aria-hidden
                />
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {avatarUploading ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </div>
              </label>
              {avatarError && (
                <p className="text-sm text-destructive mb-2">{avatarError}</p>
              )}
              <p className="text-xs text-muted-foreground mb-4">
                {t("account.clickToChangeImage")}
              </p>
              <h2 className="font-semibold text-lg mb-4">{displayFullName}</h2>
              <div className="w-full space-y-3 text-sm border-t pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("account.memberSince")}</span>
                  <span className="font-medium">
                    {profile?.createdAt
                      ? getMemberSince(new Date(profile.createdAt), locale)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("account.lastActive")}</span>
                  <span className="font-medium">{lastActivityText}</span>
                </div>
                {savedAddress?.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("account.phone")}</span>
                    <span className="font-medium">{savedAddress.phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("account.email")}</span>
                  <span className="font-medium truncate max-w-[140px]">
                    {displayEmail}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        <div className="lg:col-span-2 space-y-6">
          {wishlist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-4 h-4" />
                  {t("account.wishlist")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {wishlistProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Link
                        href={productUrl(product)}
                        className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted"
                        aria-label={product.name}
                      >
                        <ImageWithFallback
                          src={product.galleryImages?.[0] ?? product.images?.default ?? "/logo.svg"}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={productUrl(product)}>
                          <p className="font-medium text-sm truncate hover:underline">
                            {product.name}
                          </p>
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {Number(product.price ?? 0).toLocaleString("sv-SE")} kr
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleWishlist(Number(product.id))}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        aria-label={t("wishlist.removeFromWishlist")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {loading ? "—" : orders.length}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("account.orders")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {loading
                      ? "—"
                      : `${totalSpent.toLocaleString("sv-SE", {
                          maximumFractionDigits: 0,
                        })} kr`}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("account.totalSpent")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Package className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {loading ? "—" : deliveredCount}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("account.delivered")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 shrink-0 text-muted-foreground" />
                {t("account.orderHistory")}
              </CardTitle>
              <CardDescription>{t("account.orderHistoryDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {t("account.loadingOrders")}
                </p>
              ) : orders.length === 0 ? (
                <div className="py-12 text-center">
                  <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground mb-4">
                    {t("account.noOrdersYet")}
                  </p>
                  <Link href="/products">
                    <Button variant="outline">{t("account.shopNow")}</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => {
                    const trackingUrl = order.postNordTrackingId
                      ? `${POSTNORD_TRACKING_BASE}?shipmentId=${encodeURIComponent(order.postNordTrackingId)}`
                      : null;
                    const trackingPending =
                      (order.status === "shipped" ||
                        order.status === "delivered" ||
                        order.status === "completed") &&
                      !order.postNordTrackingId;
                    const statusLabel = orderStatusLabel(order.status);
                    const stripeInfo = order.stripePaymentId
                      ? orderStripeReceipts[order.id.toString()]
                      : undefined;
                    const receiptUrl = stripeInfo?.receiptUrl;
                    const stripeReceiptLoading =
                      Boolean(order.stripePaymentId) && stripeInfo === undefined;
                    const tmOrderLine = t("account.tmOrderWithNumber", {
                      n: normalizeShopOrderNumber(order.orderNumber),
                    });
                    const stripeReceiptLine =
                      order.stripePaymentId &&
                      stripeInfo !== undefined &&
                      stripeInfo.receiptNumber
                        ? t("account.stripeReceiptWithNumber", {
                            n: stripeInfo.receiptNumber,
                          })
                        : null;
                    const ariaRef =
                      order.stripePaymentId && stripeInfo?.receiptNumber
                        ? `${tmOrderLine}, ${stripeReceiptLine ?? ""}`
                        : tmOrderLine;

                    return (
                      <div
                        key={order.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedOrder(order)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedOrder(order);
                          }
                        }}
                        aria-label={t("account.openOrderDetailsAria", { ref: ariaRef })}
                        className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border/80 bg-card/50 p-4 transition-colors hover:border-primary/30 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="rounded-lg bg-muted p-2 shrink-0">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-semibold leading-tight text-foreground">
                              {tmOrderLine}
                            </p>
                            {order.stripePaymentId && stripeReceiptLoading && (
                              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                                {t("common.loading")}
                              </p>
                            )}
                            {stripeReceiptLine && !stripeReceiptLoading && (
                              <p className="text-xs font-medium text-muted-foreground">
                                {stripeReceiptLine}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {Number(order.total ?? 0).toLocaleString(
                                locale === "en" ? "en-GB" : "sv-SE",
                              )}{" "}
                              {t("common.kr")}
                              <span className="text-border mx-1.5">·</span>
                              <span
                                className={cn(
                                  "rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-tight tracking-tight",
                                  orderStatusBadgeClass(order.status),
                                )}
                              >
                                {statusLabel}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString(
                                locale === "en" ? "en-GB" : "sv-SE",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </p>
                            {!stripeReceiptLoading && (
                              <p className="flex items-center gap-0.5 text-xs font-medium text-primary/90 pt-0.5">
                                <span>{t("account.clickOrderForDetails")}</span>
                                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                          {order.stripePaymentId &&
                            (stripeReceiptLoading ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled
                                className="pointer-events-none opacity-70"
                              >
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                {t("account.receipt")}
                              </Button>
                            ) : receiptUrl ? (
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={receiptUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FileText className="mr-1 h-3 w-3" />
                                  {t("account.receipt")}
                                  <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                                </a>
                              </Button>
                            ) : null)}
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover:bg-black hover:text-white hover:border-black"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReviewOrder(order);
                            }}
                          >
                            <MessageSquare className="w-3 h-3 mr-1" />
                            {t("account.writeReview")}
                          </Button>
                          {trackingUrl && (
                            <Link
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t("orderDetail.trackingStatusHint")}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="outline" size="sm">
                                <ExternalLink className="w-3 h-3 mr-1" />
                                {t("account.trackDelivery")}
                              </Button>
                            </Link>
                          )}
                          {trackingPending && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="pointer-events-auto cursor-not-allowed opacity-65"
                              title={t("orderDetail.trackingPendingAdmin")}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t("account.trackingPendingShort")}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {orders.length > 0 && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  {t("account.orderCount", { count: orders.length })}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      <OrderReviewsModal
        order={reviewOrder}
        onClose={() => setReviewOrder(null)}
      />

      <Dialog open={addressModalOpen} onOpenChange={setAddressModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {t("account.addressDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("account.addressDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <AddressEditForm
            initialAddress={savedAddress ?? undefined}
            onSave={async (address) => {
              const res = await fetch("/api/user/address", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(address),
              });
              if (!res.ok) throw new Error(t("account.saveError"));
              refreshProfile();
              setAddressModalOpen(false);
            }}
            onCancel={() => setAddressModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              {t("account.deleteAccountTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("account.deleteAccountDesc", { phrase: t("account.deleteConfirmPhrase") })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeleteAccount} className="space-y-4">
            {profile?.hasPassword && (
              <div>
                <Label htmlFor="deletePassword">{t("account.yourPassword")}</Label>
                <Input
                  id="deletePassword"
                  type="password"
                  autoComplete="current-password"
                  value={deleteForm.password}
                  onChange={(e) =>
                    setDeleteForm((p) => ({ ...p, password: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="deleteConfirm">
                  Skriv &quot;ta bort mitt konto&quot; för att bekräfta
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => navigator.clipboard.writeText("ta bort mitt konto")}
                >
                  Kopiera
                </Button>
              </div>
              <Input
                id="deleteConfirm"
                type="text"
                value={deleteForm.confirmText}
                onChange={(e) =>
                  setDeleteForm((p) => ({ ...p, confirmText: e.target.value }))
                }
                className="mt-1"
                placeholder={t("account.deleteConfirmPhrase")}
              />
            </div>
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteModalOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  deleteSubmitting ||
                  deleteForm.confirmText !== t("account.deleteConfirmPhrase") ||
                  (profile?.hasPassword && !deleteForm.password)
                }
              >
                {deleteSubmitting ? t("account.deleting") : t("account.deletePermanently")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              {t("account.exportTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("account.exportDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {exportError && (
              <p className="text-sm text-destructive">{exportError}</p>
            )}
            <Button onClick={handleExportData} disabled={exportLoading}>
              {exportLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {t("account.exporting")}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  {t("account.downloadPdf")}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
