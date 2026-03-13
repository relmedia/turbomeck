"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, RefreshCw, ChevronLeft, ChevronRight, Banknote, ShoppingCart, FolderTree, TrendingUp, Trash2, Star, PlusCircle } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Image from "next/image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PRODUCT_API } from "@/lib/product-api";
import { resolveImageUrl } from "@/lib/image-utils";

type Category = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

function categoryDisplayName(c: Category): string {
  return c.parentName ? `${c.parentName} › ${c.name}` : c.name;
}

type Product = {
  id: number;
  name: string;
  shortDescription?: string;
  description?: string;
  price: number;
  image: string | null;
  thumbnails?: string[];
  stock: number;
  weight?: number | null;
  sku?: string | null;
  categoryIds: number[];
  orderCount?: number;
  totalRevenue?: number;
  createdAt?: string;
  updatedAt?: string;
};

export default function ProductViewPage() {
  const params = useParams();
  const productId = params.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPage = searchParams.get("fromPage");
  const fromQuery = fromPage ? `?fromPage=${fromPage}` : "";
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const fetchProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productRes, categoriesRes] = await Promise.all([
        fetch(`${PRODUCT_API}/products/${productId}`),
        fetch(`${PRODUCT_API}/categories`),
      ]);
      if (!productRes.ok) throw new Error("Produkt hittades inte");
      const data = await productRes.json();
      const cats: Category[] = categoriesRes.ok ? await categoriesRes.json() : [];
      setProduct(data);
      setCategories(cats);
      setSelectedImageIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (productId) fetchProduct();
  }, [productId, fetchProduct]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${PRODUCT_API}/products/${productId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Kunde inte ta bort produkt");
      router.push("/studio/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod");
      setDeleting(false);
    }
  };

  const allImages = product
    ? [product.image, ...(product.thumbnails ?? [])].filter(Boolean).map(resolveImageUrl) as string[]
    : [];

  const categoryNames = (product?.categoryIds ?? [])
    .map((id) => categories.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => categoryDisplayName(c!));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="space-y-4 px-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={fromPage ? `/studio/products?page=${fromPage}` : "/studio/products"}>Produkter</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Produkt hittades inte</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <div className="space-y-6 px-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/studio/products">Produkter</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {product.createdAt && (
              <span>
                Publicerad: {new Date(product.createdAt).toLocaleDateString("sv-SE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
            {product.sku && <span>SKU: {product.sku}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <Link href={`/studio/products/${product.id}${fromQuery}`}>
              <Pencil className="w-4 h-4 mr-2" />
              Redigera
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={deleting}>
                <Trash2 className="w-4 h-4 mr-2" />
                Ta bort produkt
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Är du säker?</AlertDialogTitle>
                <AlertDialogDescription>
                  Du håller på att ta bort produkten <strong>&quot;{product.name}&quot;</strong>.
                  Denna åtgärd kan inte ångras.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Raderar..." : "Ta bort"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Image gallery */}
        <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="p-0 gap-0 overflow-hidden border-0 bg-transparent">
            <CardContent className="p-0">
              {allImages.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-neutral-200">
                    <div
                      className="flex h-full transition-transform duration-300 ease-out"
                      style={{
                        width: `${allImages.length * 100}%`,
                        transform: `translateX(-${(selectedImageIndex / allImages.length) * 100}%)`,
                      }}
                    >
                      {allImages.map((img, i) => (
                        <div
                          key={i}
                          className="relative shrink-0 aspect-square"
                          style={{ width: `${100 / allImages.length}%` }}
                        >
                          <Image
                            src={img}
                            alt={product.name}
                            fill
                            className="object-cover"
                            priority={i === 0}
                          />
                        </div>
                      ))}
                    </div>
                    {allImages.length > 1 && (
                      <>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full"
                          onClick={() =>
                            setSelectedImageIndex((i) =>
                              i === 0 ? allImages.length - 1 : i - 1
                            )
                          }
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full"
                          onClick={() =>
                            setSelectedImageIndex((i) =>
                              i === allImages.length - 1 ? 0 : i + 1
                            )
                          }
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  {allImages.length > 1 && (() => {
                    const thumbnailsPerView = 4;
                    const thumbnailOffset = Math.max(0, Math.min(selectedImageIndex, allImages.length - thumbnailsPerView));
                    const translatePercent = (100 / allImages.length) * thumbnailOffset;
                    return (
                      <div className="overflow-hidden w-full">
                        <div
                          className="grid gap-4 transition-transform duration-300 ease-out"
                          style={{
                            gridTemplateColumns: `repeat(${allImages.length}, minmax(0, 1fr))`,
                            width: `${(allImages.length / thumbnailsPerView) * 100}%`,
                            transform: `translateX(-${translatePercent}%)`,
                          }}
                        >
                          {allImages.map((img, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelectedImageIndex(i)}
                              className={`relative aspect-square rounded-md overflow-hidden transition-all duration-200 ease-out min-w-0 bg-neutral-200 ${
                                i === selectedImageIndex
                                  ? "opacity-100"
                                  : "opacity-60 hover:opacity-80"
                              }`}
                            >
                              <Image src={img} alt="" fill className="object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="aspect-square w-full flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-sm">
                  Ingen bild
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Product details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats cards */}
          <div className="grid gap-4 rounded-lg grid-cols-2 xl:grid-cols-4">
            <Card className="py-3 px-4 gap-1 rounded-lg bg-muted hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Pris</span>
              </div>
              <div className="flex gap-2">
                <div className="w-4 shrink-0" aria-hidden />
                <p className="text-sm font-semibold">
                  {product.price.toLocaleString("sv-SE")} kr
                </p>
              </div>
            </Card>
            <Card className="py-3 px-4 gap-1 rounded-lg bg-muted hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Antal ordrar</span>
              </div>
              <div className="flex gap-2">
                <div className="w-4 shrink-0" aria-hidden />
                <p className="text-sm font-semibold">{(product.orderCount ?? 0).toLocaleString("sv-SE")}</p>
              </div>
            </Card>
            <Card className="py-3 px-4 gap-1 rounded-lg bg-muted hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Kategori</span>
              </div>
              <div className="flex gap-2">
                <div className="w-4 shrink-0" aria-hidden />
                <p className="text-sm font-semibold">
                  {categoryNames.length > 0 ? categoryNames.join(", ") : "—"}
                </p>
              </div>
            </Card>
            <Card className="py-3 px-4 gap-1 rounded-lg bg-muted hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Totalt intäkt</span>
              </div>
              <div className="flex gap-2">
                <div className="w-4 shrink-0" aria-hidden />
                <p className="text-sm font-semibold">
                  {(product.totalRevenue ?? 0).toLocaleString("sv-SE")} kr
                </p>
              </div>
            </Card>
          </div>
          <Card className="py-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 px-6">
              <div>
                <CardHeader className="py-2 px-0">
                  <CardTitle>Beskrivning</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 py-2 px-0">
                  {product.shortDescription && (
                    <p className="text-muted-foreground">{product.shortDescription}</p>
                  )}
                  {product.description ? (
                    <div
                      className="prose prose-sm max-w-none text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: product.description }}
                    />
                  ) : (
                    !product.shortDescription && (
                      <p className="text-muted-foreground">Ingen beskrivning tillagd.</p>
                    )
                  )}
                </CardContent>
              </div>
              <div className="lg:border-l lg:pl-6 lg:min-w-[280px] lg:w-[320px]">
                <CardHeader className="py-2 px-0">
                  <CardTitle>Produktattribut</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-0">
                  <dl className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <dt className="text-sm text-muted-foreground">Kategori</dt>
                      <dd className="text-sm font-medium">
                        {categoryNames.length > 0 ? categoryNames.join(", ") : "—"}
                      </dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-sm text-muted-foreground">SKU</dt>
                      <dd className="text-sm font-medium">{product.sku ?? "—"}</dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-sm text-muted-foreground">Vikt</dt>
                      <dd className="text-sm font-medium">
                        {product.weight != null ? `${product.weight} kg` : "—"}
                      </dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-sm text-muted-foreground">Pris</dt>
                      <dd className="text-sm font-medium">
                        {product.price.toLocaleString("sv-SE")} kr
                      </dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-sm text-muted-foreground">Lager</dt>
                      <dd className="text-sm font-medium">{product.stock}</dd>
                    </div>
                  </dl>
                </CardContent>
              </div>
            </div>
          </Card>

          {/* Reviews */}
          <Card className="py-4 mt-6">
            <div className="px-6">
              <CardHeader className="py-0 px-0 mb-4">
                <CardTitle>Recensioner</CardTitle>
              </CardHeader>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 px-6 items-start">
              <div className="space-y-4">
                  {[
                    { name: "Mark P.", rating: 3.2, title: "Okej men kunde varit bättre", body: "Produkten är okej, men jag förväntade mig mer för priset. Några mindre brister, men totalt sett acceptabel.", ago: "3 dagar sedan", color: "bg-blue-500" },
                    { name: "Jessica K.", rating: 5, title: "Snygg design", body: "Jag älskar det eleganta designen och enkelheten. Har inte hittat en så stilren produkt på länge. Mycket nöjd!", ago: "2 veckor sedan", color: "bg-purple-500" },
                    { name: "Michael B.", rating: 4.5, title: "Nöjd med köpet", body: "Jag är riktigt nöjd med detta köp. Kvaliteten är bra och den fungerar precis som beskrivet.", ago: "4 dagar sedan", color: "bg-orange-500" },
                    { name: "Anna M.", rating: 3, title: "Fungerar men kan förbättras", body: "Produkten fungerar, men det finns utrymme för förbättring. Byggkvaliteten känns lite billig.", ago: "1 dag sedan", color: "bg-teal-500" },
                  ].map((r, i) => (
                    <div key={i} className="relative border rounded-lg p-5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="font-medium text-sm">{r.name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{r.ago}</span>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs cursor-pointer">
                            <Pencil className="w-3 h-3 mr-1" />
                            Redigera
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className={`${r.color} text-white text-sm`}>
                            {r.name.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 text-sm text-amber-500 mb-1">
                            <Star className="w-4 h-4 fill-current" />
                            <span className="text-muted-foreground">{r.rating}</span>
                          </div>
                          <p className="font-medium text-sm">{r.title}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{r.body}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              <div className="space-y-3 border rounded-lg p-3 text-sm">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="flex text-amber-500">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`w-4 h-4 ${s <= 4 ? "fill-current" : "fill-amber-200"}`} />
                      ))}
                    </div>
                    <span className="font-semibold text-sm">4.3</span>
                    <span className="text-xs text-muted-foreground">(12)</span>
                  </div>
                  <Button size="sm" variant="outline" className="mt-1.5 w-full justify-center cursor-pointer h-8 text-xs">
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    Skicka recension
                  </Button>
                </div>
                <div className="space-y-2">
                  {[
                    { stars: 5, pct: 70 },
                    { stars: 4, pct: 17 },
                    { stars: 3, pct: 7 },
                    { stars: 2, pct: 4 },
                    { stars: 1, pct: 2 },
                  ].map(({ stars, pct }) => (
                    <div key={stars} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-10">{stars}★</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-7">{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
