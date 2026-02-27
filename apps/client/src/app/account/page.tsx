"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  Key,
  AlertTriangle,
  ChevronRight,
  FileText,
  Download,
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
import AddressEditForm from "@/components/AddressEditForm";
import { fetchOrders, fetchProductsByIds, type Order } from "@/lib/api";
import OrderDetailModal from "@/components/OrderDetailModal";
import { type SavedAddress } from "@/types";
import { useWishlist } from "@/hooks/useWishlist";
import { productUrl } from "@/lib/utils";

const POSTNORD_TRACKING_BASE =
  "https://www.postnord.se/vara-verktyg/spara-din-forsandelse";

function getMemberSince(date: Date): string {
  return date.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function orderStatusLabel(s: string) {
  return s === "confirmed"
    ? "Bekräftad"
    : s === "shipped"
      ? "Skickad"
      : s === "delivered"
        ? "Levererad"
        : s === "cancelled"
          ? "Avbruten"
          : s;
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
  const { data: session, status, update: updateSession } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [wishlistProducts, setWishlistProducts] = useState<Awaited<ReturnType<typeof fetchProductsByIds>>>([]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string | null>>({});
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ password: "", confirmText: "" });
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const { wishlist, toggle: toggleWishlist } = useWishlist();

  const savedAddress = profile?.savedAddress;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Lösenorden matchar inte");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("Nytt lösenord måste vara minst 6 tecken");
      return;
    }
    setPasswordSubmitting(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error ?? "Kunde inte ändra lösenord");
        return;
      }
      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setPasswordError("Nätverksfel. Försök igen.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    if (deleteForm.confirmText !== "ta bort mitt konto") {
      setDeleteError('Skriv "ta bort mitt konto" för att bekräfta');
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
        setDeleteError(data.error ?? "Kunde inte ta bort kontot");
        return;
      }
      setDeleteModalOpen(false);
      await signOut({ callbackUrl: "/" });
    } catch {
      setDeleteError("Nätverksfel. Försök igen.");
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
      fetchOrders(session.user.id),
    ])
      .then(([profileData, ordersData]) => {
        setProfile(profileData);
        setOrders(ordersData ?? []);
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
        throw new Error(data.error ?? "Kunde inte ladda upp");
      }
      refreshProfile();
      await updateSession?.({ image: data.image });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  };

  if (status === "loading") {
    return (
      <div className="w-full mt-12 flex justify-center">
        <div className="animate-pulse text-muted-foreground">Laddar...</div>
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
              <Button>Logga in</Button>
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
        if (diffDays === 0) return "Idag";
        if (diffDays === 1) return "Igår";
        if (diffDays < 7) return `För ${diffDays} dagar sedan`;
        return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
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
        <h1 className="text-2xl font-semibold">Profil</h1>
        <nav className="inline-flex rounded-lg bg-muted p-1 gap-0.5 ml-auto [&_button]:cursor-pointer">
          <button
            type="button"
            onClick={() => setAddressModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          >
            <MapPin className="w-4 h-4" />
            Leveransadress
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPasswordModalOpen(true);
              setPasswordError(null);
              setPasswordSuccess(false);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          >
            <Key className="w-4 h-4" />
            Byt lösenord
            <ChevronRight className="w-4 h-4" />
          </button>
          <Link
            href="/account/export"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportera data
            <ChevronRight className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={() => {
              setDeleteModalOpen(true);
              setDeleteError(null);
              setDeleteForm({ password: "", confirmText: "" });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-destructive/90 hover:text-destructive hover:bg-background transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Ta bort konto
            <ChevronRight className="w-4 h-4" />
          </button>
        </nav>
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
                  <AvatarImage src={avatarImage ?? undefined} alt="Profilbild" />
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
                Klicka för att byta bild
              </p>
              <h2 className="font-semibold text-lg mb-4">{displayFullName}</h2>
              <div className="w-full space-y-3 text-sm border-t pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Medlem sedan</span>
                  <span className="font-medium">
                    {profile?.createdAt
                      ? getMemberSince(new Date(profile.createdAt))
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Senast aktiv</span>
                  <span className="font-medium">{lastActivityText}</span>
                </div>
                {savedAddress?.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefon</span>
                    <span className="font-medium">{savedAddress.phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">E-post</span>
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
                  Önskelista
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
                        href={productUrl(product.id, product.name)}
                        className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted"
                      >
                        <Image
                          src={product.galleryImages?.[0] ?? product.images?.default ?? ""}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={productUrl(product.id, product.name)}>
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
                        aria-label="Ta bort från önskelista"
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
                  <p className="text-sm text-muted-foreground">Beställningar</p>
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
                  <p className="text-sm text-muted-foreground">Totalt köpt</p>
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
                  <p className="text-sm text-muted-foreground">Levererade</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-4 h-4" />
                Senaste beställningar
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Laddar beställningar...
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
                              Beställning #{order.orderNumber}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {order.total.toLocaleString("sv-SE")} kr ·{" "}
                              {statusLabel}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(order.createdAt).toLocaleDateString(
                                "sv-SE",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </p>
                          </div>
                        </div>
                        {trackingUrl && (
                          <Link
                            href={trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sm:shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="outline" size="sm">
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Spåra leverans
                            </Button>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {orders.length > 5 && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  Visar 5 senaste av {orders.length} beställningar
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
                  Stripe-kvitton
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Klicka för att öppna Stripe:s hostade kvitto i webbläsaren.
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium">Beställning</th>
                        <th className="px-4 py-3 text-left font-medium">Datum</th>
                        <th className="px-4 py-3 text-left font-medium">Mottagare</th>
                        <th className="px-4 py-3 text-left font-medium">Leverans</th>
                        <th className="px-4 py-3 text-right font-medium">Delsumma</th>
                        <th className="px-4 py-3 text-right font-medium">Frakt</th>
                        <th className="px-4 py-3 text-right font-medium">Rabatt</th>
                        <th className="px-4 py-3 text-right font-medium">Totalt</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-center font-medium">Kvitto</th>
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
                                {new Date(order.createdAt).toLocaleDateString("sv-SE", {
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
                                    Visa
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

      <Dialog open={addressModalOpen} onOpenChange={setAddressModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Leveransadress
            </DialogTitle>
            <DialogDescription>
              Uppdatera din sparade leveransadress. Den används vid kassa.
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
              if (!res.ok) throw new Error("Failed to save");
              refreshProfile();
              setAddressModalOpen(false);
            }}
            onCancel={() => setAddressModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

        <Dialog
          open={passwordModalOpen}
          onOpenChange={(open) => {
            setPasswordModalOpen(open);
            if (!open) {
              setPasswordError(null);
              setPasswordSuccess(false);
            }
          }}
        >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Byt lösenord
            </DialogTitle>
            <DialogDescription>
              Ange nuvarande lösenord och välj ett nytt lösenord. Ett bekräftelsemail skickas till din e-postadress när lösenordet har ändrats.
            </DialogDescription>
          </DialogHeader>
          {profile?.hasPassword === false ? (
            <p className="text-sm text-muted-foreground">
              Du är inloggad via ett externt konto. Lösenord kan inte ändras här.
            </p>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Nuvarande lösenord</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="newPassword">Nytt lösenord</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Bekräfta nytt lösenord</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
              {passwordSuccess && (
                <p className="text-sm text-emerald-600">Lösenordet har ändrats.</p>
              )}
              <Button type="submit" disabled={passwordSubmitting}>
                {passwordSubmitting ? "Sparar..." : "Byt lösenord"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Ta bort konto
            </DialogTitle>
            <DialogDescription>
              Detta tar permanent bort ditt konto och alla tillhörande data. Denna åtgärd kan inte ångras. Skriv &quot;ta bort mitt konto&quot; för att bekräfta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeleteAccount} className="space-y-4">
            {profile?.hasPassword && (
              <div>
                <Label htmlFor="deletePassword">Ditt lösenord</Label>
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
                placeholder="ta bort mitt konto"
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
                Avbryt
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  deleteSubmitting ||
                  deleteForm.confirmText !== "ta bort mitt konto" ||
                  (profile?.hasPassword && !deleteForm.password)
                }
              >
                {deleteSubmitting ? "Tar bort..." : "Ta bort konto permanent"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
