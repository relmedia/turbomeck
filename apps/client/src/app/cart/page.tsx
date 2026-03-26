"use client";

import { useTranslation, useLanguage } from "@/i18n/context";
import PaymentForm from "@/components/PaymentForm";
import ShippingForm from "@/components/ShippingForm";
import useCartStore from "@/stores/cartStore";
import { CartItemType, ShippingFormInputs } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, ShoppingBag, Trash2 } from "lucide-react";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { getShippingPrice } from "@/lib/postnord";
import { createOrder } from "@/lib/api";
import { useSession } from "next-auth/react";
import type { SavedAddress } from "@/types";


const CartPage: React.FC = () => {
  const router = useRouter();
  const t = useTranslation();
  const { locale } = useLanguage();
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
  const [shippingFromApi, setShippingFromApi] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [expandedSection, setExpandedSection] = useState<1 | 3>(1);

  const { cart, removeFromCart, updateQuantity, clearCart } = useCartStore();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [savedAddress, setSavedAddress] = useState<SavedAddress | undefined>();
  const [geoCountry, setGeoCountry] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetch("/api/user/me")
        .then((r) => r.json())
        .then((d) => setSavedAddress(d.savedAddress));
    } else {
      setSavedAddress(undefined);
    }
  }, [userId]);

  useEffect(() => {
    fetch("/api/geo/country")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGeoCountry(d?.country ?? null))
      .catch(() => setGeoCountry(null));
  }, []);

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
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [lastValidatedCode, setLastValidatedCode] = useState("");
  const discount = appliedCoupon ? couponDiscount : 0;

  useEffect(() => {
    if (appliedCoupon && lastValidatedCode && subtotal > 0) {
      fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: lastValidatedCode, subtotal }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.valid && data.discount != null) {
            setCouponDiscount(data.discount);
          } else {
            setAppliedCoupon(false);
            setCouponDiscount(0);
            setLastValidatedCode("");
          }
        })
        .catch(() => {});
    }
  }, [subtotal, appliedCoupon, lastValidatedCode]);

  useEffect(() => {
    const weightKg = Math.max(0.1, totalWeightKg);
    const params = new URLSearchParams({
      weightKg: String(weightKg),
      deliveryOption,
      country: shippingCountry,
    });
    fetch(`/api/postnord/postpaket-price?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.price != null ? setShippingFromApi(d.price) : setShippingFromApi(null)))
      .catch(() => setShippingFromApi(null));
  }, [totalWeightKg, deliveryOption, shippingCountry]);

  const shipping =
    postNordSelection?.price != null
      ? postNordSelection.price
      : shippingFromApi != null
        ? shippingFromApi
        : getShippingPrice(totalWeightKg, shippingCountry, deliveryOption);
  const total = subtotal - discount + shipping;

  // Deposit flow: only for Sweden, determined by IP geolocation. Shipping form country does not affect deposit.
  const orderDeposit = cart.reduce(
    (acc, item) => acc + (item.depositAmount ?? 0) * item.quantity,
    0
  );
  const isDepositOrder = orderDeposit > 0 && geoCountry === "SE";
  const balanceDue = isDepositOrder ? Math.max(0, total - orderDeposit) : 0;
  const amountToCharge = isDepositOrder ? orderDeposit : total;

  const handleApplyCoupon = () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponError("");
    fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotal }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid && data.discount != null) {
          setAppliedCoupon(true);
          setCouponDiscount(data.discount);
          setLastValidatedCode(code);
          setCouponError("");
        } else {
          setAppliedCoupon(false);
          setCouponDiscount(0);
          setLastValidatedCode("");
          setCouponError(data.message ?? "Ogiltig rabattkod");
        }
      })
      .catch(() => {
        setAppliedCoupon(false);
        setCouponDiscount(0);
        setCouponError(t("cart.couponError"));
      });
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
      title: t("cart.yourDetails"),
      content: (
        <ShippingForm
          setShippingForm={setShippingForm}
          onSuccess={() => setExpandedSection(3)}
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
      id: 3 as const,
      title: t("cart.paymentMethod"),
      content: shippingForm ? (
        <PaymentForm
          total={amountToCharge}
          getOrderPayload={() => ({
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
            depositAmount: isDepositOrder ? orderDeposit : undefined,
            balanceDue: isDepositOrder ? balanceDue : undefined,
            postNordTrackingId: undefined,
            locale: locale as "sv" | "en",
            items: cart.map((item) => ({
              productId: typeof item.id === "number" ? item.id : undefined,
              productName: item.name,
              productImage: item.images?.default || item.galleryImages?.[0],
              variant: item.selectedVariant,
              price: item.price,
              quantity: item.quantity,
            })),
          })}
          onComplete={async (result) => {
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
                couponCode:
                  appliedCoupon && lastValidatedCode
                    ? lastValidatedCode
                    : undefined,
                subtotal,
                shippingCost: shipping,
                discount,
                total,
                depositAmount: isDepositOrder ? orderDeposit : undefined,
                balanceDue: isDepositOrder ? balanceDue : undefined,
                stripePaymentId: result.stripePaymentId,
                postNordTrackingId: postNordTrackingId ?? undefined,
                locale: locale as "sv" | "en",
                items: cart.map((item) => ({
                  productId: typeof item.id === "number" ? item.id : undefined,
                  productName: item.name,
                  productImage: item.images?.default || item.galleryImages?.[0],
                  variant: item.selectedVariant,
                  price: item.price,
                  quantity: item.quantity,
                })),
              });
              clearCart();
              const params = new URLSearchParams();
              if (order.postNordTrackingId) params.set("tracking", order.postNordTrackingId);
              params.set("orderId", String(order.id));
              params.set("total", String(total));
              if (!userId && order.viewToken) params.set("token", order.viewToken);
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
          {t("cart.completePrevious")}
        </p>
      ),
    },
  ];

  if (cart.length === 0) {
    return (
      <div className="w-full mt-8 lg:mt-12">
        <div className="bg-card border rounded-lg p-12 text-center flex flex-col items-center gap-4">
          <ShoppingBag className="h-16 w-16 text-muted-foreground" strokeWidth={1.5} />
          <h2 className="text-xl font-bold text-foreground">{t("cart.empty")}</h2>
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {t("cart.emptyDescription")}
          </p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => router.push("/products")}
          >
            {t("cart.continueShopping")}
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
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-bold mb-1">{t("cart.title")}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t("cart.itemsCount")} {cart.reduce((a, i) => a + i.quantity, 0)}{" "}
              {cart.reduce((a, i) => a + i.quantity, 0) === 1
                ? t("cart.product")
                : t("cart.products")}{" "}
              {t("cart.inCart")}
            </p>
            <div className="space-y-4">
              {cart.map((item) => (
                <CartItemRow
                  key={`${item.id}-${item.selectedSize}-${item.selectedColor}-${item.selectedVariant ?? ""}`}
                  item={item}
                  onRemove={() => removeFromCart(item)}
                  onQuantityChange={(q) => updateQuantity(item, q)}
                />
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-border space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                <span className="font-medium">
                  {subtotal.toLocaleString("sv-SE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{" "}
                  kr
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cart.shipping")}</span>
                <span className="font-medium">{shipping} kr</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t("cart.discount")}</span>
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
              {isDepositOrder && (
                <>
                  <div className="flex justify-between text-amber-700 dark:text-amber-400">
                    <span>{t("cart.depositNow")}</span>
                    <span className="font-medium">
                      {orderDeposit.toLocaleString("sv-SE", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}{" "}
                      kr
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>{t("cart.balanceLater")}</span>
                    <span>
                      {balanceDue.toLocaleString("sv-SE", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}{" "}
                      kr
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("cart.depositInfo")}</p>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("cart.vat")}</span>
                <span className="font-medium">
                  {Math.round((subtotal - discount + shipping) * 0.2).toLocaleString("sv-SE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{" "}
                  kr
                </span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-1">
                <span>{isDepositOrder ? t("cart.depositNow") : t("cart.total")}</span>
                <span>
                  {amountToCharge.toLocaleString("sv-SE", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{" "}
                  kr
                </span>
              </div>
            </div>
          </div>

          {/* Coupon Code – bottom card */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-bold mb-1">{t("cart.couponCode")}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t("cart.couponHint")}
            </p>
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-4 py-3">
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  {t("cart.couponApplied", { amount: discount.toLocaleString("sv-SE") })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    setAppliedCoupon(false);
                    setCouponDiscount(0);
                    setLastValidatedCode("");
                    setCouponCode("");
                    setCouponError("");
                  }}
                >
                  {t("cart.remove")}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center rounded-lg border border-input bg-white overflow-hidden focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-0 focus-within:border-ring">
                  <Input
                    type="text"
                    placeholder={t("cart.couponPlaceholder")}
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCouponError("");
                    }}
                    className="h-9 flex-1 border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-0"
                  />
                  <Button
                    type="button"
                    onClick={handleApplyCoupon}
                    size="sm"
                    className="h-6 py-0 px-1.5 text-xs bg-gray-900 hover:bg-gray-800 text-white shrink-0 cursor-pointer rounded-none my-1 ml-1 mr-2"
                  >
                    {t("cart.apply")}
                  </Button>
                </div>
                {couponError && (
                  <p className="text-sm text-red-600 mt-2">{couponError}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - Checkout Forms or Login Prompt */}
        <div className="lg:w-3/5 space-y-4">
          {!session ? (
            <div className="bg-card border rounded-lg p-8 flex flex-col items-center justify-center text-center gap-4">
              <h3 className="text-lg font-semibold">{t("cart.loginToComplete")}</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {t("cart.loginToCompleteDesc")}
              </p>
              <Button asChild>
                <Link href="/logga-in?callbackUrl=%2Fcart">{t("nav.login")}</Link>
              </Button>
            </div>
          ) : (
            sections.map((section) => (
              <div
                key={section.id}
                className="bg-card border rounded-lg overflow-hidden"
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
            ))
          )}
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
  const t = useTranslation();
  const imageSrc =
    item.images?.[item.selectedColor] || item.images?.default || "";
  const hasSizes = item.sizes?.length > 0 && item.sizes[0] !== "-";
  const hasColors = item.colors?.length > 1 && item.colors[0] !== "default";
  const details: string[] = [];
  if (item.selectedVariant) details.push(item.selectedVariant);
  if (hasColors) details.push(`${t("cart.colorLabel")}: ${item.selectedColor}`);
  if (hasSizes) details.push(`${t("cart.sizeLabel")}: ${item.selectedSize}`);
  useEffect(() => {
    if (item.quantity > 4) onQuantityChange(4);
  }, [item.quantity, onQuantityChange]);
  return (
    <div className="flex gap-4 py-4 border-b border-border last:border-0">
      <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-muted">
        <ImageWithFallback
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
            aria-label={t("cart.removeItem")}
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
