"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { PRODUCT_API } from "@/lib/product-api";

/**
 * Create an order by hand, without going through the shop.
 *
 * The point is to produce a *real, bookable* order: PostNord booking only
 * accepts collection at a service point, so the service point picker is not
 * optional decoration — without one the resulting order can never be booked
 * (see `postnord-book-shipment/route.ts`).
 *
 * Prices are never sent. product-service re-prices from the product ids, so
 * what the browser believes a product costs cannot influence the order total.
 * This form only chooses *which* products and *how many*.
 */

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  image: string | null;
};

type ServicePoint = {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
};

type Line = { productId: number; quantity: number };

export type AddOrderProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after an order is created, so a list can refresh itself. */
  onCreated?: (order: { id: number; orderNumber: string }) => void;
};

const EMPTY_CUSTOMER = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  postalCode: "",
  city: "",
  country: "SE",
};

export function AddOrder({ open, onOpenChange, onCreated }: AddOrderProps) {
  const [customer, setCustomer] = useState({ ...EMPTY_CUSTOMER });
  const [lines, setLines] = useState<Line[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([]);
  const [servicePointId, setServicePointId] = useState("");
  const [spLoading, setSpLoading] = useState(false);
  const [spError, setSpError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (key: keyof typeof EMPTY_CUSTOMER, value: string) =>
    setCustomer((c) => ({ ...c, [key]: value }));

  // Reset on close so a second open never inherits the previous attempt.
  useEffect(() => {
    if (open) return;
    setCustomer({ ...EMPTY_CUSTOMER });
    setLines([]);
    setServicePoints([]);
    setServicePointId("");
    setSpError(null);
  }, [open]);

  useEffect(() => {
    if (!open || products.length > 0) return;
    setProductsLoading(true);
    fetch(`${PRODUCT_API}/products`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        setProducts(Array.isArray(data) ? (data as Product[]) : []);
      })
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [open, products.length]);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const lookupServicePoints = useCallback(async () => {
    const postal = customer.postalCode.replace(/\s/g, "");
    if (postal.length < 3) {
      setSpError("Fyll i postnummer först.");
      return;
    }
    setSpLoading(true);
    setSpError(null);
    try {
      const res = await fetch(
        `/api/postnord/servicepoints?postalCode=${encodeURIComponent(postal)}&country=${encodeURIComponent(customer.country)}`,
      );
      const data = (await res.json()) as {
        servicePoints?: ServicePoint[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const points = data.servicePoints ?? [];
      setServicePoints(points);
      if (points.length === 0) setSpError("Inga ombud hittades för postnumret.");
      // One obvious choice is not a choice — pick it so the form can be saved.
      else if (points.length === 1 && points[0]) setServicePointId(points[0].id);
    } catch (err) {
      setServicePoints([]);
      setSpError(err instanceof Error ? err.message : "Kunde inte hämta ombud.");
    } finally {
      setSpLoading(false);
    }
  }, [customer.postalCode, customer.country]);

  const addLine = (productId: number) => {
    setLines((ls) =>
      ls.some((l) => l.productId === productId)
        ? ls.map((l) =>
            l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...ls, { productId, quantity: 1 }],
    );
  };

  const estimatedTotal = lines.reduce((sum, l) => {
    const p = productById.get(l.productId);
    return sum + (p ? p.price * l.quantity : 0);
  }, 0);

  const chosenPoint = servicePoints.find((p) => p.id === servicePointId);

  const canSubmit =
    !submitting &&
    customer.firstName.trim() !== "" &&
    customer.lastName.trim() !== "" &&
    customer.email.trim() !== "" &&
    customer.address.trim() !== "" &&
    customer.postalCode.trim() !== "" &&
    customer.city.trim() !== "" &&
    lines.length > 0 &&
    servicePointId !== "";

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customer,
          phone: customer.phone.trim() || undefined,
          deliveryOption: "servicepoint",
          servicePointId,
          servicePointName: chosenPoint?.name,
          // Sent now because it cannot be fetched later: PostNord retired every
          // by-id service point lookup, and the EDI booking will not accept a
          // deliveryParty without an address.
          servicePointStreet: chosenPoint?.address || undefined,
          servicePointPostalCode: chosenPoint?.postalCode || undefined,
          servicePointCity: chosenPoint?.city || undefined,
          servicePointCountryCode: customer.country,
          items: lines,
        }),
      });
      const data = (await res.json()) as {
        id?: number;
        orderNumber?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      toast.success(`Order ${data.orderNumber ?? ""} skapad`);
      onCreated?.({ id: data.id ?? 0, orderNumber: data.orderNumber ?? "" });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skapa order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A stray click on the backdrop must not discard the form. This is a
          long dialog — customer, address, products, service point — and
          losing it halfway through is a real cost, where closing it is one
          click away via Avbryt, Escape or the X. */}
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Lägg till order</DialogTitle>
          <DialogDescription>
            Skapar en order utan betalning, märkt som skapad i admin. Används för
            att testa fraktbokning utan att handla i butiken.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Customer */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Kund</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ao-first">Förnamn</Label>
                <Input
                  id="ao-first"
                  value={customer.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ao-last">Efternamn</Label>
                <Input
                  id="ao-last"
                  value={customer.lastName}
                  onChange={(e) => setField("lastName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ao-email">E-post</Label>
                <Input
                  id="ao-email"
                  type="email"
                  value={customer.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ao-phone">Telefon (valfritt)</Label>
                <Input
                  id="ao-phone"
                  value={customer.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Address */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Leveransadress</h3>
            <div className="space-y-1.5">
              <Label htmlFor="ao-address">Adress</Label>
              <Input
                id="ao-address"
                value={customer.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ao-postal">Postnummer</Label>
                <Input
                  id="ao-postal"
                  value={customer.postalCode}
                  onChange={(e) => setField("postalCode", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ao-city">Ort</Label>
                <Input
                  id="ao-city"
                  value={customer.city}
                  onChange={(e) => setField("city", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ao-country">Land</Label>
                <Select
                  value={customer.country}
                  onValueChange={(v) => {
                    setField("country", v);
                    setServicePoints([]);
                    setServicePointId("");
                  }}
                >
                  <SelectTrigger id="ao-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SE">Sverige</SelectItem>
                    <SelectItem value="NO">Norge</SelectItem>
                    <SelectItem value="DK">Danmark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Service point — required, because booking needs one */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Ombud</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={lookupServicePoints}
                disabled={spLoading}
              >
                {spLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Hämta ombud
              </Button>
            </div>
            {servicePoints.length > 0 ? (
              <Select value={servicePointId} onValueChange={setServicePointId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj ombud" />
                </SelectTrigger>
                <SelectContent>
                  {servicePoints.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.address}, {p.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {spError ??
                  "Fyll i postnummer och hämta ombud. Krävs för att ordern ska gå att boka hos PostNord."}
              </p>
            )}
            {spError && servicePoints.length > 0 && (
              <p className="text-sm text-destructive">{spError}</p>
            )}
          </section>

          {/* Products */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Produkter</h3>
            {productsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select
                value=""
                onValueChange={(v) => addLine(Number(v))}
                disabled={products.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Lägg till produkt…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} — {p.price} kr{p.stock < 1 ? " (slut)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Minst en produkt krävs.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {lines.map((line) => {
                  const p = productById.get(line.productId);
                  return (
                    <li
                      key={line.productId}
                      className="flex items-center gap-3 p-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {p?.name ?? `Produkt ${line.productId}`}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={line.quantity}
                        onChange={(e) => {
                          const q = Math.max(
                            1,
                            Math.min(99, Number(e.target.value) || 1),
                          );
                          setLines((ls) =>
                            ls.map((l) =>
                              l.productId === line.productId
                                ? { ...l, quantity: q }
                                : l,
                            ),
                          );
                        }}
                        className="w-20"
                      />
                      <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">
                        {p ? p.price * line.quantity : 0} kr
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          setLines((ls) =>
                            ls.filter((l) => l.productId !== line.productId),
                          )
                        }
                        aria-label="Ta bort rad"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {lines.length > 0 && (
              <p className="text-right text-sm text-muted-foreground">
                Preliminärt varuvärde:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {estimatedTotal} kr
                </span>
                {" — frakt och rabatt räknas av servern."}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Avbryt
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Skapa order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddOrder;
