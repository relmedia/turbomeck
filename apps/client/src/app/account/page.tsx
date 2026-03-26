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
  Star,
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
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { productUrl } from "@/lib/utils";

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
    if (s === "shipped") return t("account.orderStatusShipped");
    if (s === "delivered") return t("account.orderStatusDelivered");
    if (s === "cancelled") return t("account.orderStatusCancelled");
    return s;
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
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string | null>>({});
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
    Promise.all([
      fetch(`/api/user/me`).then((r) => r.json()),
      fetchOrders(),
    ])
      .then(([profileData, ordersData]) => {
        setProfile(profileData);
        setOrders(ordersData ?? []);
        const addr = profileData?.savedAddress;
        const full = addr?.firstName && addr?.lastName
          ? `${addr.firstName} ${addr.lastName}`.trim()
          : null;
        if (full && profileData?.name !== full) {
          fetch("/api/account/sync-name", { method: "POST" }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
      const map: Record<string, string | null> = {};
      await Promise.all(
        paidOrders.map(async (o) => {
          if (!o.stripePaymentId) return;
          try {
            const res = await fetch(
              `/api/stripe/receipt-url?paymentIntentId=${encodeURIComponent(o.stripePaymentId)}`
            );
            const data = await res.json();
            map[o.id.toString()] = data.receiptUrl ?? null;
          } catch {
            map[o.id.toString()] = null;
          }
        })
      );
      setReceiptUrls((prev) => ({ ...prev, ...map }));
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

  const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
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
                      >
                        <ImageWithFallback
                          src={product.galleryImages?.[0] ?? product.images?.default ?? "/logo.svg"}
                          alt={product.name}
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
                          {product.price.toLocaleString("sv-SE")} kr
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
                <Star className="w-4 h-4" />
                {t("account.recentOrders")}
              </CardTitle>
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
                    Du har inte gjort några beställningar ännu.
                  </p>
                  <Link href="/products">
                    <Button variant="outline">Handla nu</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.slice(0, 5).map((order) => {
                    const trackingUrl = order.postNordTrackingId
                      ? `${POSTNORD_TRACKING_BASE}?shipmentId=${encodeURIComponent(order.postNordTrackingId)}`
                      : null;
                    const statusLabel =
                      order.status === "confirmed"
                        ? "Bekräftad"
                        : order.status === "shipped"
                          ? "Skickad"
                          : order.status === "delivered"
                            ? "Levererad"
                            : order.status === "cancelled"
                              ? "Avbruten"
                              : order.status;

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
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 cursor-pointer hover:bg-muted/50 rounded-lg border border-border transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-muted shrink-0">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {t("account.order")} #{order.orderNumber}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {order.total.toLocaleString("sv-SE")} kr ·{" "}
                              {statusLabel}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(order.createdAt).toLocaleDateString(
                                locale === "en" ? "en-GB" : "sv-SE",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 sm:shrink-0">
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
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="outline" size="sm">
                                <ExternalLink className="w-3 h-3 mr-1" />
                                {t("account.trackDelivery")}
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {orders.length > 5 && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  {t("account.showingOrders", { count: orders.length })}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {orders.filter((o) => o.stripePaymentId).length > 0 && (
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {t("account.stripeReceipts")}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t("account.stripeReceiptsDesc")}
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium">{t("account.order")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("account.date")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("account.recipient")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("account.delivery")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("account.subtotal")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("account.shipping")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("account.discount")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("account.total")}</th>
                        <th className="px-4 py-3 text-left font-medium">{t("account.status")}</th>
                        <th className="px-4 py-3 text-center font-medium">{t("account.receipt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders
                        .filter((o) => o.stripePaymentId)
                        .map((order) => {
                          const receiptUrl = receiptUrls[order.id.toString()];
                          return (
                            <tr
                              key={order.id}
                              className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                            >
                              <td className="px-4 py-3 font-medium">#{order.orderNumber}</td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {new Date(order.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "sv-SE", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </td>
                              <td className="px-4 py-3">
                                {order.firstName} {order.lastName}
                                <span className="block text-xs text-muted-foreground truncate max-w-[140px]">
                                  {order.email}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground max-w-[120px]">
                                {order.servicePointName || (
                                  <>
                                    {order.address}
                                    <span className="block text-xs">
                                      {order.postalCode} {order.city}
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {Number(order.subtotal).toLocaleString("sv-SE")} kr
                              </td>
                              <td className="px-4 py-3 text-right">
                                {Number(order.shippingCost).toLocaleString("sv-SE")} kr
                              </td>
                              <td className="px-4 py-3 text-right">
                                {Number(order.discount) > 0
                                  ? `-${Number(order.discount).toLocaleString("sv-SE")} kr`
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                {Number(order.total).toLocaleString("sv-SE")} kr
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs">
                                  {orderStatusLabel(order.status)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {receiptUrl === undefined ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground inline-block" />
                                ) : receiptUrl ? (
                                  <a
                                    href={receiptUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {t("account.view")}
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
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
