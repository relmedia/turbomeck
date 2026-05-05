"use client";

import { useState, useEffect } from "react";
import { PRODUCT_API } from "@/lib/product-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, GripVertical, ImageIcon } from "lucide-react";

type Product = {
  id: number;
  name: string;
  price: number;
  image: string | null;
  thumbnails: string[];
  featuredInSlider?: number;
  sliderOrder?: number | null;
};

export default function SliderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchProducts = () => {
    setLoading(true);
    setLoadError(null);
    fetch(`${PRODUCT_API}/products`)
      .then(async (r) => {
        const data: unknown = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(data)) {
          const msg =
            (data && typeof data === "object" && "error" in data
              ? String((data as { error: unknown }).error)
              : null) ??
            `Kunde inte ladda produkter (HTTP ${r.status}).`;
          setProducts([]);
          setLoadError(msg);
          return;
        }
        setProducts(data as Product[]);
      })
      .catch((err: unknown) => {
        setProducts([]);
        setLoadError(
          err instanceof Error ? err.message : "Kunde inte ansluta till produkt-tjänsten."
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const sliderProducts = products
    .filter((p) => (p.featuredInSlider ?? 0) === 1)
    .sort((a, b) => (a.sliderOrder ?? 999) - (b.sliderOrder ?? 999));
  const otherProducts = products.filter((p) => (p.featuredInSlider ?? 0) !== 1);

  const updateProduct = async (
    id: number,
    featuredInSlider: number,
    sliderOrder: number | null
  ) => {
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`${PRODUCT_API}/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featuredInSlider, sliderOrder }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Kunde inte spara");
      }
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, featuredInSlider, sliderOrder } : p
        )
      );
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const addToSlider = (product: Product) => {
    const maxOrder = sliderProducts.reduce(
      (m, p) => Math.max(m, p.sliderOrder ?? 0),
      0
    );
    updateProduct(product.id, 1, maxOrder + 1);
  };

  const removeFromSlider = (product: Product) => {
    updateProduct(product.id, 0, null);
  };

  const setOrder = (product: Product, order: number) => {
    updateProduct(product.id, 1, order);
  };

  const resolveImage = (p: Product) => {
    const img = p.image || p.thumbnails?.[0];
    if (!img) return "/logo.svg";
    if (img.startsWith("http")) return img;
    const base = process.env.NEXT_PUBLIC_UPLOADS_BASE || "";
    return img.startsWith("/") ? `${base}${img}` : img;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">Kunde inte ladda produkter</p>
          <p className="mt-1 text-destructive/80">{loadError}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchProducts}>
          <RefreshCw className="mr-2 h-4 w-4" /> Försök igen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          Hantera vilka produkter som visas i slidern på startsidan. Produkterna visas i angiven ordning.
        </p>
        <Button variant="outline" size="sm" onClick={fetchProducts}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Uppdatera
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GripVertical className="h-5 w-5" />
            Produkter i slider ({sliderProducts.length})
          </CardTitle>
          <CardDescription>
            Dessa produkter visas i slidern på startsidan, i angiven ordning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sliderProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga produkter i slidern. Lägg till produkter nedan.
            </p>
          ) : (
            <div className="space-y-3">
              {sliderProducts.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 rounded-lg border p-3"
                >
                  <img
                    src={resolveImage(p)}
                    alt={p.name}
                    className="h-14 w-14 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{p.price} kr</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`order-${p.id}`} className="text-sm whitespace-nowrap">
                      Ordning:
                    </Label>
                    <Input
                      id={`order-${p.id}`}
                      type="number"
                      min={1}
                      defaultValue={p.sliderOrder ?? idx + 1}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v > 0) setOrder(p, v);
                      }}
                      className="w-16"
                      disabled={saving[p.id]}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFromSlider(p)}
                    disabled={saving[p.id]}
                  >
                    {saving[p.id] ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      "Ta bort"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Lägg till i slider
          </CardTitle>
          <CardDescription>
            Produkter som inte redan visas i slidern.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {otherProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Alla produkter är redan i slidern.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {otherProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <img
                    src={resolveImage(p)}
                    alt={p.name}
                    className="h-12 w-12 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.price} kr</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addToSlider(p)}
                    disabled={saving[p.id]}
                  >
                    {saving[p.id] ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      "Lägg till"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
