"use client";

import PaymentForm from "@/components/PaymentForm";
import ShippingForm from "@/components/ShippingForm";
import useCartStore from "@/stores/cartStore";
import { CartItemType, ShippingFormInputs } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EUROPEAN_COUNTRIES } from "@/components/PhoneInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, ShoppingCart, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { getShippingPrice } from "@/lib/postnord";
import { createOrder } from "@/lib/api";
import { useAuth, useUser } from "@clerk/nextjs";
import type { SavedAddress } from "@/types";

const DISCOUNT_PERCENT = 10;

const CartPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [shippingForm, setShippingForm] = useState<ShippingFormInputs>();
  const [shippingPreview, setShippingPreview] = useState<{
    deliveryOption?: "home" | "servicepoint";
    country?: string;
  }>({});
  const [postNordSelection, setPostNordSelection] = useState<{
    price?: number;
    sessionId?: string;
    displayName?: string;
  } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(false);
  const [expandedSection, setExpandedSection] = useState<1 | 2 | 3>(1);

  const { cart, removeFromCart, updateQuantity, clearCart } = useCartStore();
  const { userId } = useAuth();
  const { user } = useUser();
  const savedAddress = user?.publicMetadata?.savedAddress as
    | SavedAddress
    | undefined;

  const deliveryOption =
    shippingForm?.deliveryOption ?? shippingPreview?.deliveryOption ?? "servicepoint";
  const shippingCountry =
    shippingForm?.country ?? shippingPreview?.country ?? "SE";

  const subtotal = cart.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );
  const totalWeightKg = cart.reduce(
    (acc, item) =>
      acc + (item.weight ?? 1) * item.quantity,
    0
  );
  const discount = appliedCoupon ? subtotal * (DISCOUNT_PERCENT / 100) : 0;
  const shipping =
    postNordSelection?.price != null
      ? postNordSelection.price
      : getShippingPrice(
          totalWeightKg,
          shippingCountry,
          deliveryOption
        );
  const total = subtotal - discount + shipping;

  const handleApplyCoupon = () => {
    if (couponCode.trim().toLowerCase() === "rabatt") {
      setAppliedCoupon(true);
    }
  };

  const handleDeliveryChange = useCallback(
    (opt: "home" | "servicepoint", country: string) => {
      setShippingPreview((prev) =>
        prev.deliveryOption === opt && prev.country === country
          ? prev
          : { deliveryOption: opt, country }
      );
    },
    []
  );

  const sections = [
    {
      id: 1 as const,
      title: "Dina uppgifter",
      content: (
        <ShippingForm
          setShippingForm={setShippingForm}
          onSuccess={() => setExpandedSection(2)}
          onDeliveryChange={handleDeliveryChange}
          defaultAddress={savedAddress}
          showSaveAddressOption={!!userId}
          onPostNordSelection={(sel) =>
            setPostNordSelection(
              sel
                ? {
                    price: sel.price,
                    sessionId: sel.sessionId,
                    displayName: sel.displayName,
                  }
                : null
            )
          }
          cartItems={cart}
        />
      ),
    },
    {
      id: 2 as const,
      title: "Fraktadress",
      content: shippingForm ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Leverans till: {shippingForm.firstName} {shippingForm.lastName}
          </p>
          <p className="text-sm text-muted-foreground">
            {shippingForm.address}, {shippingForm.postalCode} {shippingForm.city}
            {shippingForm.country &&
              `, ${
                EUROPEAN_COUNTRIES.find((c) => c.code === shippingForm.country)
                  ?.name ?? shippingForm.country
              }`}
          </p>
          {shippingForm.servicePoint && (
            <p className="text-sm">
              Ombud: {shippingForm.servicePoint.name}
            </p>
          )}
          <Button
            type="button"
            onClick={() => setExpandedSection(3)}
            className="w-full"
          >
            Nästa steg
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Fyll i dina uppgifter först.
        </p>
      ),
    },
    {
      id: 3 as const,
      title: "Betalningssätt",
      content: shippingForm ? (
        <PaymentForm
          onComplete={async () => {
            let postNordTrackingId: string | null = null;

            if (postNordSelection?.sessionId && shippingForm) {
              try {
                const completeRes = await fetch(
                  `/api/postnord/shipping/complete-session/${postNordSelection.sessionId}`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      deliveryAddress: shippingForm,
                      userInputs: {
                        email: shippingForm.email,
                        phone: shippingForm.phone,
                        phoneCountryTwoLetterIso: shippingForm.country,
                      },
                    }),
                  }
                );
                if (completeRes.ok) {
                  const data = await completeRes.json();
                  postNordTrackingId = data?.shipmentId ?? data?.trackingId ?? null;
                }
              } catch {
                // Non-blocking; continue with order
              }
            }

            try {
              const order = await createOrder({
                userId: userId ?? undefined,
                email: shippingForm!.email,
                firstName: shippingForm!.firstName,
                lastName: shippingForm!.lastName,
                phone: shippingForm!.phone,
                address: shippingForm!.address,
                city: shippingForm!.city,
                postalCode: shippingForm!.postalCode,
                country: shippingForm!.country,
                servicePointName: shippingForm!.servicePoint?.name,
                servicePointId: shippingForm!.servicePoint?.servicePointId,
                deliveryOption: deliveryOption,
                subtotal,
                shippingCost: shipping,
                discount,
                total,
                postNordTrackingId: postNordTrackingId ?? undefined,
                items: cart.map((item) => ({
                  productId: typeof item.id === "number" ? item.id : undefined,
                  productName: item.name,
                  productImage: item.images?.default || item.galleryImages?.[0],
                  price: item.price,
                  quantity: item.quantity,
                })),
              });
              clearCart();
              const params = new URLSearchParams();
              if (order.postNordTrackingId) params.set("tracking", order.postNordTrackingId);
              params.set("orderId", String(order.id));
              router.push(`/order/success?${params.toString()}`);
            } catch (err) {
              console.error("Failed to create order:", err);
              clearCart();
              router.push("/order/success");
            }
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Slutför föregående steg först.
        </p>
      ),
    },
  ];

  if (cart.length === 0) {
    return (
      <div className="w-full mt-8 lg:mt-12">
        <div className="bg-card border rounded-lg shadow-sm p-12 text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-lg">Varukorgen är tom</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/products")}
          >
            Fortsätt handla
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-8 lg:mt-12">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        {/* LEFT COLUMN - Shopping Cart (combined) + Coupon */}
        <div className="lg:w-2/5 space-y-6">
          {/* Shopping Cart – items + order summary + place order */}
          <div className="bg-card border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-1">Varukorg</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Du har {cart.reduce((a, i) => a + i.quantity, 0)}{" "}
              {cart.reduce((a, i) => a + i.quantity, 0) === 1
                ? "produkt"
                : "produkter"}{" "}
              i varukorgen
            </p>
            <div className="space-y-4">
              {cart.map((item) => (
                <CartItemRow
                  key={`${item.id}-${item.selectedSize}-${item.selectedColor}`}
                  item={item}
                  onRemove={() => removeFromCart(item)}
                  onQuantityChange={(q) => updateQuantity(item, q)}
                />
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-border space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delsumma</span>
                <span className="font-medium">
                  {subtotal.toLocaleString("sv-SE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{" "}
                  kr
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fraktkostnad</span>
                <span className="font-medium">{shipping} kr</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Rabatt</span>
                  <span className="font-medium">
                    -
                    {discount.toLocaleString("sv-SE", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}{" "}
                    kr
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1">
                <span>Totalt</span>
                <span>
                  {total.toLocaleString("sv-SE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{" "}
                  kr
                </span>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => {
                if (cart.length > 0) setExpandedSection(3);
              }}
              disabled={cart.length === 0}
              className="w-full mt-6 h-9 text-sm cursor-pointer"
            >
              Placera beställning
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Genom att placera din beställning godkänner du vår{" "}
              <span className="underline cursor-pointer hover:text-foreground">
                Integritetspolicy
              </span>{" "}
              och{" "}
              <span className="underline cursor-pointer hover:text-foreground">
                Villkor
              </span>
              .
            </p>
          </div>

          {/* Coupon Code – bottom card */}
          <div className="bg-card border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-bold mb-1">Rabattkod</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Ange kod för att få rabatt direkt
            </p>
            <div className="flex items-center rounded-lg border border-input bg-white overflow-hidden focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-0 focus-within:border-ring">
              <Input
                type="text"
                placeholder="Kampanjkod"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="h-9 flex-1 border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-0"
              />
              <Button
                type="button"
                onClick={handleApplyCoupon}
                size="sm"
                className="h-6 py-0 px-1.5 text-xs bg-gray-900 hover:bg-gray-800 text-white shrink-0 cursor-pointer rounded-none my-1 ml-1 mr-2"
              >
                Tillämpa
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - Checkout Forms */}
        <div className="lg:w-3/5 space-y-4">
          {sections.map((section) => (
            <div
              key={section.id}
              className="bg-card border rounded-lg overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedSection(
                    expandedSection === section.id ? expandedSection : section.id
                  )
                }
                className="w-full flex items-center justify-between p-4 text-left font-medium hover:bg-muted/50 transition-colors"
              >
                {section.title}
                {expandedSection === section.id ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {expandedSection === section.id && (
                <div className="px-4 pb-4 border-t border-border pt-4">
                  {section.content}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function CartItemRow({
  item,
  onRemove,
  onQuantityChange,
}: {
  item: CartItemType;
  onRemove: () => void;
  onQuantityChange: (q: number) => void;
}) {
  const imageSrc =
    item.images?.[item.selectedColor] || item.images?.default || "";
  const hasSizes = item.sizes?.length > 0 && item.sizes[0] !== "-";
  const hasColors = item.colors?.length > 1 && item.colors[0] !== "default";
  const details: string[] = [];
  if (hasColors) details.push(`Färg: ${item.selectedColor}`);
  if (hasSizes) details.push(`Storlek: ${item.selectedSize}`);
  useEffect(() => {
    if (item.quantity > 4) onQuantityChange(4);
  }, [item.quantity, onQuantityChange]);
  return (
    <div className="flex gap-4 py-4 border-b border-border last:border-0">
      <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-muted">
        <Image
          src={imageSrc}
          alt={item.name}
          fill
          className="object-cover"
          sizes="80px"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{item.name}</p>
        {details.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {details.join(" / ")}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <div>
            <Select
              value={String(Math.min(4, Math.max(1, item.quantity)))}
              onValueChange={(v) => onQuantityChange(Number(v))}
            >
              <SelectTrigger className="w-24 h-8 rounded-lg border-gray-200 bg-white text-sm font-medium [&>svg]:text-gray-400">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="p-2 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
            aria-label="Ta bort"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-sm font-semibold shrink-0 self-start">
        {(item.price * item.quantity).toLocaleString("sv-SE", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}{" "}
        kr
      </p>
    </div>
  );
}

export default CartPage;
