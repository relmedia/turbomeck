"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import PaymentForm from "@/components/PaymentForm";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/context";

/** Always use Next.js proxy (adds INTERNAL_PRODUCT_API_SECRET server-side). */
const PRODUCT_API = "/api/product";

type BalanceInfo = {
  orderId: number;
  orderNumber: string;
  balanceDue: number;
  customerName: string;
};

export default function PayBalancePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslation();
  const orderId = searchParams.get("orderId");
  const orderToken = searchParams.get("token");
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Order-ID saknas");
      setLoading(false);
      return;
    }
    fetch(`${PRODUCT_API}/orders/${orderId}/balance`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setBalance(null);
        } else {
          setBalance(data);
          setError(null);
        }
      })
      .catch(() => {
        setError("Kunde inte hämta order");
        setBalance(null);
      })
      .finally(() => setLoading(false));
  }, [orderId, orderToken]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className="mx-auto max-w-lg p-4 pt-8">
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Link>
        </Button>
        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="text-destructive">
              {error === "Order not found"
                ? "Ordern hittades inte."
                : error === "Forbidden"
                  ? "Ogiltig eller utgången länk. Be om en ny betalningslänk från butiken."
                  : error === "Balance already paid"
                  ? "Återstoden är redan betald."
                  : error === "No balance due for this order"
                    ? "Denna order har ingen återstod att betala."
                    : error || "Något gick fel."}
            </p>
            <Button variant="link" asChild className="mt-2 p-0">
              <Link href="/">Gå till startsidan</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-4 pt-8">
      <Button variant="outline" size="sm" asChild>
        <Link href="/">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Link>
      </Button>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">
            Betala återstod – Order {balance.orderNumber}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Du betalar resterande belopp för din beställning. Depositionen är redan betald.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Att betala</p>
            <p className="text-2xl font-semibold">
              {balance.balanceDue.toLocaleString("sv-SE", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}{" "}
              {t("common.kr")}
            </p>
          </div>
          <PaymentForm
            total={balance.balanceDue}
            balanceOrder={{
              orderId: balance.orderId,
              orderToken: orderToken ?? undefined,
            }}
            getOrderPayload={() => ({
              email: "",
              firstName: balance.customerName.split(" ")[0] ?? "",
              lastName: balance.customerName.split(" ").slice(1).join(" ") || "",
              phone: "",
              address: "",
              city: "",
              postalCode: "",
              country: "SE",
              subtotal: balance.balanceDue,
              shippingCost: 0,
              discount: 0,
              total: balance.balanceDue,
              items: [],
            })}
            onComplete={async (result) => {
              try {
                const res = await fetch(
                  `${PRODUCT_API}/orders/${balance.orderId}/balance-paid`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      stripePaymentId: result.stripePaymentId,
                    }),
                  }
                );
                const data = await res.json();
                if (!res.ok) {
                  throw new Error(data.error ?? "Kunde inte registrera betalning");
                }
                const ok = new URLSearchParams({
                  orderId: String(balance.orderId),
                  balancePaid: "1",
                });
                if (orderToken) ok.set("token", orderToken);
                router.push(`/order/success?${ok.toString()}`);
              } catch (err) {
                console.error("Failed to record balance payment:", err);
                const fail = new URLSearchParams({ orderId: String(balance.orderId) });
                if (orderToken) fail.set("token", orderToken);
                router.push(`/order/success?${fail.toString()}`);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
