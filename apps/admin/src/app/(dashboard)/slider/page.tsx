"use client";

import { useState, useEffect, useRef } from "react";
import { PRODUCT_API } from "@/lib/product-api";
import { cn } from "@/lib/utils";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { RefreshCw, GripVertical, ImageIcon, ChevronUp, ChevronDown } from "lucide-react";
import { DashboardSliderPageSkeleton } from "@/components/dashboard-skeletons";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "react-toastify";

type Product = {
  id: number;
  name: string;
  price: number;
  image: string | null;
  thumbnails: string[];
  featuredInSlider?: number;
  sliderOrder?: number | null;
};

/** Move `from` to `to` within a copy of the list. */
function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return list;
  next.splice(to, 0, moved);
  return next;
}

export default function SliderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  /** Keeps keyboard focus on the handle that was just moved. */
  const handleRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const focusAfterMoveRef = useRef<number | null>(null);

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

  // A drag that lands on the handle it started from would otherwise lose focus.
  useEffect(() => {
    const id = focusAfterMoveRef.current;
    if (id == null) return;
    focusAfterMoveRef.current = null;
    handleRefs.current[id]?.focus();
  });

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

  /**
   * Writes the new running order to the server.
   *
   * The list is renumbered 1..n and only the rows whose number actually changed
   * are sent — dragging the last item up one should not rewrite every product.
   * The local state is updated first so the row lands where it was dropped with
   * no visible lag, and rolled back as a whole if any request fails; a partial
   * save would leave the slider in an order the admin never chose.
   */
  const persistOrder = async (ordered: Product[]) => {
    const changed = ordered
      .map((p, i) => ({ id: p.id, name: p.name, order: i + 1 }))
      .filter(({ id, order }) => {
        const current = products.find((p) => p.id === id)?.sliderOrder ?? null;
        return current !== order;
      });
    if (changed.length === 0) return;

    const snapshot = products;
    setProducts((prev) =>
      prev.map((p) => {
        const hit = changed.find((c) => c.id === p.id);
        return hit ? { ...p, sliderOrder: hit.order } : p;
      })
    );

    setReordering(true);
    try {
      const results = await Promise.all(
        changed.map(({ id, order }) =>
          fetch(`${PRODUCT_API}/products/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ featuredInSlider: 1, sliderOrder: order }),
          }).then((res) => ({ res, id }))
        )
      );
      const failed = results.filter(({ res }) => !res.ok);
      if (failed.length > 0) {
        throw new Error(`${failed.length} av ${changed.length} produkter kunde inte sparas`);
      }
      toast.success("Ordningen sparad");
    } catch (err) {
      setProducts(snapshot);
      toast.error(
        err instanceof Error
          ? `Ordningen återställdes: ${err.message}`
          : "Ordningen kunde inte sparas och återställdes"
      );
    } finally {
      setReordering(false);
    }
  };

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= sliderProducts.length || from === to) return;
    const moved = sliderProducts[from];
    if (moved) focusAfterMoveRef.current = moved.id;
    void persistOrder(reorder(sliderProducts, from, to));
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

  const resolveImage = (p: Product) => {
    const img = p.image || p.thumbnails?.[0];
    if (!img) return "/logo.svg";
    if (img.startsWith("http")) return img;
    const base = process.env.NEXT_PUBLIC_UPLOADS_BASE || "";
    return img.startsWith("/") ? `${base}${img}` : img;
  };

  if (loading) {
    return <DashboardSliderPageSkeleton />;
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
          Hantera vilka produkter som visas i slidern på startsidan. Dra för att ändra ordningen.
        </p>
        <Button variant="outline" size="sm" onClick={fetchProducts} disabled={reordering}>
          <RefreshCw className={cn("mr-2 h-4 w-4", reordering && "animate-spin")} />
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
            Dra en produkt i handtaget för att flytta den. Den översta visas först i
            slidern. Ordningen sparas direkt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sliderProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga produkter i slidern. Lägg till produkter nedan.
            </p>
          ) : (
            <ol
              className={cn(
                "space-y-2 transition-opacity",
                reordering && "pointer-events-none opacity-60"
              )}
            >
              {sliderProducts.map((p, idx) => {
                const isDragging = dragId === p.id;
                return (
                  <li
                    key={p.id}
                    draggable={!reordering}
                    onDragStart={(e) => {
                      setDragId(p.id);
                      e.dataTransfer.effectAllowed = "move";
                      // Firefox refuses to start a drag without payload.
                      e.dataTransfer.setData("text/plain", String(p.id));
                    }}
                    onDragEnter={() => {
                      if (dragId !== null && dragId !== p.id) setDropIndex(idx);
                    }}
                    onDragOver={(e) => {
                      // Without this the drop event never fires.
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = sliderProducts.findIndex((x) => x.id === dragId);
                      setDragId(null);
                      setDropIndex(null);
                      if (from !== -1) moveTo(from, idx);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropIndex(null);
                    }}
                    className={cn(
                      "flex items-center gap-4 rounded-lg border bg-card p-3 transition-all",
                      isDragging && "opacity-40",
                      dropIndex === idx && !isDragging && "border-primary ring-2 ring-primary/30"
                    )}
                  >
                    <button
                      type="button"
                      ref={(el) => {
                        handleRefs.current[p.id] = el;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          moveTo(idx, idx - 1);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          moveTo(idx, idx + 1);
                        }
                      }}
                      className="cursor-grab touch-none rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                      aria-label={`Flytta ${p.name}, position ${idx + 1} av ${sliderProducts.length}. Använd piltangenterna upp och ner.`}
                    >
                      <GripVertical className="h-5 w-5" aria-hidden />
                    </button>

                    <span className="w-6 shrink-0 text-center font-mono text-sm tabular-nums text-muted-foreground">
                      {idx + 1}
                    </span>

                    <img
                      src={resolveImage(p)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded object-cover"
                      draggable={false}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-sm text-muted-foreground">{p.price} kr</p>
                    </div>

                    {/* Visible on touch, where HTML5 drag-and-drop does not fire. */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveTo(idx, idx - 1)}
                        disabled={idx === 0 || reordering}
                        aria-label={`Flytta ${p.name} uppåt`}
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveTo(idx, idx + 1)}
                        disabled={idx === sliderProducts.length - 1 || reordering}
                        aria-label={`Flytta ${p.name} nedåt`}
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFromSlider(p)}
                      disabled={saving[p.id] || reordering}
                    >
                      {saving[p.id] ? (
                        <Skeleton className="h-4 w-10 rounded" />
                      ) : (
                        "Ta bort"
                      )}
                    </Button>
                  </li>
                );
              })}
            </ol>
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
                    alt=""
                    className="h-12 w-12 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.price} kr</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addToSlider(p)}
                    disabled={saving[p.id] || reordering}
                  >
                    {saving[p.id] ? (
                      <Skeleton className="h-4 w-14 rounded" />
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
