"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  User,
  Package,
  ExternalLink,
  Pencil,
  ShoppingBag,
  Star,
  CreditCard,
  MapPin,
  Heart,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOrders, fetchProductsByIds, type Order } from "@/lib/api";
import OrderDetailModal from "@/components/OrderDetailModal";
import { type SavedAddress } from "@/types";
import AddressEditForm from "@/components/AddressEditForm";
import { useWishlist } from "@/hooks/useWishlist";
import { productUrl } from "@/lib/utils";

const POSTNORD_TRACKING_BASE =
  "https://www.postnord.se/vara-verktyg/spara-din-forsandelse";

function getMemberSince(date: Date): string {
  return date.toLocaleDateString("sv-SE", { month: "short", year: "numeric" });
}

type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string | null;
  savedAddress?: SavedAddress;
};

export default function AccountPage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAddress, setEditingAddress] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [wishlistProducts, setWishlistProducts] = useState<Awaited<ReturnType<typeof fetchProductsByIds>>>([]);
  const { wishlist, toggle: toggleWishlist } = useWishlist();

  const savedAddress = profile?.savedAddress;

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

  const refreshProfile = () => {
    fetch("/api/user/me")
      .then((r) => r.json())
      .then(setProfile);
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
  const displayEmail = profile?.email ?? session.user.email ?? "—";

  return (
    <div className="w-full mt-8 mb-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Profil</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card className="flex flex-col items-center text-center">
            <CardContent className="pt-6 w-full flex flex-col items-center">
              <div className="relative w-24 h-24 rounded-full overflow-hidden bg-muted shrink-0 mb-4">
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt="Profilbild"
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
              </div>
              <h2 className="font-semibold text-lg mb-4">{displayName}</h2>
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Leveransadress
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editingAddress ? (
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
                    setEditingAddress(false);
                  }}
                  onCancel={() => setEditingAddress(false)}
                />
              ) : (
                <>
                  {savedAddress ? (
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">
                        {savedAddress.firstName} {savedAddress.lastName}
                      </p>
                      <p className="text-muted-foreground">
                        {savedAddress.address}
                      </p>
                      <p className="text-muted-foreground">
                        {savedAddress.postalCode} {savedAddress.city}
                        {savedAddress.country && `, ${savedAddress.country}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-4">
                      Du har inte lagt till en leveransadress än. Den används vid
                      kassa för att förifylla leveransuppgifter.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingAddress(true)}
                    className="mt-4"
                  >
                    <Pencil className="w-3 h-3 mr-2" />
                    {savedAddress ? "Ändra adress" : "Lägg till adress"}
                  </Button>
                </>
              )}
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
                <div className="divide-y divide-border">
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
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 rounded-md -mx-2 px-2 transition-colors"
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
      </div>

      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
