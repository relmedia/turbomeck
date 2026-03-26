"use client";

import DOMPurify from "isomorphic-dompurify";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, RefreshCw, ChevronLeft, ChevronRight, Banknote, ShoppingCart, FolderTree, TrendingUp, Trash2, Star, List } from "lucide-react";
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

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays === 0) return "Idag";
  if (diffDays === 1) return "Igår";
  if (diffDays < 7) return `${diffDays} dagar sedan`;
  if (diffWeeks === 1) return "1 vecka sedan";
  if (diffWeeks < 4) return `${diffWeeks} veckor sedan`;
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

const AVATAR_COLORS = ["bg-blue-500", "bg-purple-500", "bg-orange-500", "bg-teal-500", "bg-pink-500"];

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
  const [reviews, setReviews] = useState<
    { id: number; userName: string; rating: number; title: string | null; comment: string | null; createdAt: string }[]
  >([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
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

  const fetchReviewsForProduct = useCallback(async (pid: string) => {
    setReviewsLoading(true);
    try {
      const res = await fetch(`/api/reviews?productId=${pid}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data);
      } else {
        setReviews([]);
      }
    } catch {
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (productId) fetchProduct();
  }, [productId, fetchProduct]);

  useEffect(() => {
    if (productId && product) {
      fetchReviewsForProduct(productId);
    }
  }, [productId, product, fetchReviewsForProduct]);

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
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(product.description, {
                          ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "h1", "h2", "h3", "ul", "ol", "li", "a"],
                          ALLOWED_ATTR: ["href", "target"],
                        }),
                      }}
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
                {reviewsLoading ? (
                  <div className="flex justify-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : reviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6">Inga recensioner ännu.</p>
                ) : (
                  reviews.map((r, i) => (
                    <div key={r.id} className="relative border rounded-lg p-5">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="font-medium text-sm">{r.userName}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{formatTimeAgo(r.createdAt)}</span>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs cursor-pointer" asChild>
                            <Link href={`/studio/reviews/${r.id}/edit`}>
                              <Pencil className="w-3 h-3 mr-1" />
                              Redigera
                            </Link>
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className={`${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-white text-sm`}>
                            {r.userName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 text-sm text-amber-500 mb-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-4 h-4 ${s <= r.rating ? "fill-current" : ""}`}
                              />
                            ))}
                            <span className="text-muted-foreground ml-0.5">{r.rating}</span>
                          </div>
                          {r.title && <p className="font-medium text-sm">{r.title}</p>}
                          {r.comment && (
                            <p className="text-sm text-muted-foreground mt-0.5">{r.comment}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-3 border rounded-lg p-3 text-sm">
                {(() => {
                  const totalCount = reviews.length;
                  const averageRating =
                    totalCount > 0
                      ? Math.round(
                          (reviews.reduce((s, r) => s + r.rating, 0) / totalCount) * 10
                        ) / 10
                      : 0;
                  const dist = [5, 4, 3, 2, 1].map((stars) => ({
                    stars,
                    count: reviews.filter((r) => r.rating === stars).length,
                  }));
                  const maxCount = Math.max(1, ...dist.map((d) => d.count));
                  return (
                    <>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="flex text-amber-500">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-4 h-4 ${
                                  s <= Math.round(averageRating) ? "fill-current" : "fill-amber-200"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="font-semibold text-sm">{averageRating}</span>
                          <span className="text-xs text-muted-foreground">({totalCount})</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1.5 w-full justify-center cursor-pointer h-8 text-xs"
                          asChild
                        >
                          <Link href="/studio/reviews">
                            <List className="w-4 h-4 mr-1.5" />
                            Visa alla recensioner
                          </Link>
                        </Button>
                      </div>
                      {totalCount > 0 && (
                        <div className="space-y-2">
                          {dist.map(({ stars, count }) => (
                            <div key={stars} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-10">{stars}★</span>
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${(count / maxCount) * 100}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-7">
                                {totalCount > 0 ? Math.round((count / totalCount) * 100) : 0}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
