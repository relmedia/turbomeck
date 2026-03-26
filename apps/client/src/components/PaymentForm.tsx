"use client";

import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import Link from "next/link";
import { ShoppingBagIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Image from "next/image";

export type PendingOrderPayload = {
  userId?: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address: string;
  city: string;
  postalCode: string;
  country?: string;
  servicePointName?: string;
  servicePointId?: string;
  deliveryOption?: string;
  couponCode?: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  depositAmount?: number;
  balanceDue?: number;
  postNordTrackingId?: string;
  locale?: "sv" | "en";
  items: Array<{
    productId?: number;
    productName: string;
    productImage?: string;
    variant?: string;
    price: number;
    quantity: number;
  }>;
};

type PaymentFormProps = {
  total: number;
  getOrderPayload: () => PendingOrderPayload;
  onComplete?: (result: { stripePaymentId: string }) => void;
};

function CheckoutForm({
  paymentIntentId,
  getOrderPayload,
  onComplete,
}: {
  paymentIntentId: string;
  getOrderPayload: () => PendingOrderPayload;
  onComplete?: (r: { stripePaymentId: string }) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!acceptPrivacy) {
      setError("Du måste godkänna integritetspolicyn och villkoren för att slutföra köpet.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const payload = getOrderPayload();
    try {
      sessionStorage.setItem("pendingStripeOrder", JSON.stringify(payload));
    } catch {
      // Non-blocking
    }

    try {
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order/success?from_stripe=1`,
          payment_method_data: {
            billing_details: {
              name: `${payload.firstName} ${payload.lastName}`.trim() || undefined,
              email: payload.email || undefined,
              phone: payload.phone || undefined,
              address: {
                line1: payload.address || undefined,
                city: payload.city || undefined,
                postal_code: payload.postalCode || undefined,
                state: "", // Required when address fields are "never" - empty for Nordic/EU addresses
                country: payload.country || "SE",
              },
            },
          },
        },
        redirect: "if_required",
      });

      if (submitError) {
        setError(submitError.message ?? "Betalningen misslyckades");
        return;
      }

      const id = paymentIntent?.id ?? paymentIntentId;
      if (onComplete && id) {
        onComplete({ stripePaymentId: id });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Betalningen misslyckades");
    } finally {
      setIsLoading(false);
    }
  };

  const payload = getOrderPayload();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement
        options={{
          layout: "tabs",
          fields: {
            billingDetails: {
              name: "never",
              email: "never",
              phone: "never",
              address: "never",
            },
          },
          defaultValues: {
            billingDetails: {
              name: `${payload.firstName} ${payload.lastName}`.trim() || undefined,
              email: payload.email || undefined,
              phone: payload.phone || undefined,
              address: {
                line1: payload.address || undefined,
                city: payload.city || undefined,
                postal_code: payload.postalCode || undefined,
                country: payload.country || "SE",
              },
            },
          },
        }}
      />
      <label className="flex items-start gap-2 cursor-pointer mt-2">
        <Checkbox
          checked={acceptPrivacy}
          onCheckedChange={(v) => {
            setAcceptPrivacy(v === true);
            setError(null);
          }}
          className="mt-0.5"
        />
        <span className="text-sm text-muted-foreground">
          Jag godkänner{" "}
          <Link href="/privacy" target="_blank" className="underline hover:text-foreground">
            integritetspolicyn
          </Link>
          {" "}och{" "}
          <Link href="/terms" target="_blank" className="underline hover:text-foreground">
            köpvillkoren
          </Link>
          {" "}<span className="text-destructive">*</span>
        </span>
      </label>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      <div className="flex items-center gap-2 mt-2">
        <Image src="/klarna.png" alt="Klarna" width={50} height={25} className="rounded-md" />
        <Image src="/cards.png" alt="Cards" width={50} height={25} className="rounded-md" />
        <Image src="/stripe.png" alt="Stripe" width={50} height={25} className="rounded-md" />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || isLoading || !acceptPrivacy}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            Slutför köpet
            <ShoppingBagIcon className="w-4 h-4" />
          </>
        )}
      </Button>
    </form>
  );
}

export default function PaymentForm({ total, getOrderPayload, onComplete }: PaymentFormProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const configFetched = useRef(false);

  useEffect(() => {
    if (configFetched.current) return;
    configFetched.current = true;

    fetch("/api/stripe/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.error || !data.publishableKey) {
          throw new Error(data.error ?? "Stripe publishable key not configured");
        }
        setStripePromise(loadStripe(data.publishableKey));
      })
      .catch((err) => {
        setApiError(err.message ?? "Kunde inte ladda Stripe-konfiguration");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!stripePromise || total <= 0) return;

    setLoading(true);
    setApiError(null);

    fetch("/api/stripe/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: total }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId ?? null);
      })
      .catch((err) => setApiError(err.message ?? "Kunde inte starta betalning"))
      .finally(() => setLoading(false));
  }, [stripePromise, total]);

  if (!stripePromise && !apiError) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stripePromise && apiError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm">
        <p className="text-amber-800 dark:text-amber-200">
          Stripe är inte konfigurerat. Lägg till NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY i apps/payment-service/.env
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
        {apiError}
      </div>
    );
  }

  if (!clientSecret) {
    return null;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        locale: "sv",
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#171717",
            borderRadius: "8px",
          },
        },
      }}
    >
      <CheckoutForm
        paymentIntentId={paymentIntentId ?? ""}
        getOrderPayload={getOrderPayload}
        onComplete={onComplete}
      />
    </Elements>
  );
}
