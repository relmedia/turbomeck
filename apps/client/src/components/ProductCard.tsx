"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useCartStore from "@/stores/cartStore";
import type { ProductType } from "@/types";
import { productUrl } from "@/lib/utils";
import { useWishlist } from "@/hooks/useWishlist";
import { fetchReviews } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  ShoppingCart,
  Star,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowLeftRight,
} from "lucide-react";
import { ImageWithFallback } from "./ImageWithFallback";
import { toast } from "react-toastify";
import { useTranslation } from "@/i18n/context";

const ProductCard: React.FC<{ product: ProductType; priority?: boolean }> = ({
  product,
  priority = false,
}) => {
  const t = useTranslation();
  const router = useRouter();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0]);
  const [selectedColor, setSelectedColor] = useState<string>(product.colors[0]);
  const attrs = product.attributes ?? [];
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const { toggle: toggleWishlist, isInWishlist, isSignedIn } = useWishlist();
  const { addToCart } = useCartStore();
  const [reviewStats, setReviewStats] = useState<{
    averageRating: number;
    totalCount: number;
  } | "loading" | "error">("loading");

  const images: string[] =
    product.galleryImages && product.galleryImages.length > 0
      ? product.galleryImages.filter(
          (u): u is string => typeof u === "string" && u.length > 0
        )
      : [product.images?.default || "/logo.svg"];

  const cardImageSrc = images[currentImageIndex] ?? images[0] ?? "/logo.svg";

  useEffect(() => {
    const pid = Number(product.id);
    if (!pid) {
      setReviewStats({ averageRating: 0, totalCount: 0 });
      return;
    }
    fetchReviews(pid)
      .then(({ averageRating, totalCount }) =>
        setReviewStats({ averageRating, totalCount })
      )
      .catch(() => setReviewStats("error"));
  }, [product.id]);

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImageLoaded(false);
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImageLoaded(false);
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Products with attributes require selection on the product page – don't add from card
    if (attrs.length > 0) {
      router.push(productUrl(product));
      return;
    }
    setIsAddingToCart(true);
    addToCart({
      ...product,
      quantity: 1,
      selectedSize,
      selectedColor,
    });
    toast.success(t("product.addedToCart"));
    setTimeout(() => setIsAddingToCart(false), 600);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) {
      toast.info(t("product.loginToSave"));
      return;
    }
    const wasInList = isInWishlist(Number(product.id));
    toggleWishlist(Number(product.id));
    toast.success(
      wasInList ? t("product.removedFromWishlist") : t("product.addedToWishlist")
    );
  };

  const hasSizes = product.sizes.length > 1 || product.sizes[0] !== "-";
  const hasColors =
    product.colors.length > 1 || product.colors[0] !== "default";

  return (
    <Link href={productUrl(product)} className="block h-full">
      <Card className="h-full w-full max-w-sm overflow-hidden group bg-background text-foreground shadow-none rounded-md flex flex-col pt-0 pb-4 gap-3">
        {/* Image carousel */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          {!imageLoaded && (
            <Skeleton className="absolute inset-x-0 top-0 bottom-16 z-10 rounded-none" />
          )}
          <motion.div
            key={currentImageIndex}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <ImageWithFallback
              src={cardImageSrc}
              alt=""
              fill
              priority={priority}
              className="object-cover"
              onLoad={() => setImageLoaded(true)}
            />
          </motion.div>

          {product.isExchangeTurbo === true && (
            <Badge
              variant="outline"
              className="absolute top-3 left-3 z-20 flex max-w-[min(100%-1.5rem,14rem)] items-center gap-1 truncate rounded-md border-zinc-300/90 bg-white/90 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-800 shadow-sm backdrop-blur-sm dark:border-zinc-600/80 dark:bg-zinc-950/88 dark:text-zinc-100"
              title={t("product.exchangeTurboBadge")}
            >
              <ArrowLeftRight className="size-3 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
              <span className="truncate">{t("product.exchangeTurboBadge")}</span>
            </Badge>
          )}

          {/* Navigation arrows */}
          {images.length > 1 && (
            <div className="absolute inset-0 flex items-center justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-none shrink-0"
                onClick={prevImage}
                aria-label={t("product.previousProductImage", { name: product.name })}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full bg-background/80 shadow-none backdrop-blur-sm"
                onClick={nextImage}
                aria-label={t("product.nextProductImage", { name: product.name })}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}

          {/* Wishlist button */}
          <Button
            variant="secondary"
            size="icon"
            className={cn(
              "absolute top-3 right-3 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-none",
              isInWishlist(Number(product.id)) && "text-rose-500"
            )}
            onClick={handleWishlist}
            aria-label={
              isInWishlist(Number(product.id))
                ? t("wishlist.removeFromWishlist")
                : t("wishlist.addToWishlist")
            }
          >
            <Heart
              className={cn(
                "h-4 w-4",
                isInWishlist(Number(product.id)) && "fill-rose-500"
              )}
              aria-hidden
            />
          </Button>

          {/* Bottom overlay: image indicators + Add to Cart, shown on hover */}
          <div className="absolute inset-x-0 bottom-0 p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
            {images.length > 1 && (
              <div className="flex justify-center gap-1.5 items-center">
                {images.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all",
                      index === currentImageIndex
                        ? "bg-primary w-4"
                        : "bg-primary/30"
                    )}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentImageIndex(index);
                    }}
                    aria-label={t("slider.goToSlide", { n: index + 1 })}
                  />
                ))}
              </div>
            )}
            <Button
              className="w-full shadow-none"
              onClick={handleAddToCart}
              disabled={isAddingToCart}
            >
              {isAddingToCart ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("product.adding")}
                </>
              ) : attrs.length > 0 ? (
                <>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {t("common.selectOptions")}
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {t("common.addToCart")}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Content */}
        <CardContent className="p-4 flex-1 flex flex-col">
          <div className="space-y-2">
            <div>
              <h3 className="font-medium line-clamp-1">{product.name}</h3>
              {product.shortDescription && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                  {product.shortDescription}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {reviewStats === "loading" ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  <>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={cn(
                            "h-3.5 w-3.5",
                            reviewStats !== "error" &&
                              reviewStats.totalCount > 0 &&
                              i <= Math.round(reviewStats.averageRating)
                              ? "fill-amber-500 text-amber-500"
                              : "text-gray-200"
                          )}
                        />
                      ))}
                      <span className="ml-1 text-sm font-medium">
                        {reviewStats !== "error"
                          ? reviewStats.averageRating.toFixed(1)
                          : "0"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      (
                      {typeof reviewStats === "object" ? reviewStats.totalCount : 0}{" "}
                      {typeof reviewStats === "object" &&
                      reviewStats.totalCount === 1
                        ? t("common.review")
                        : t("common.reviews")}
                      )
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold">
                {product.price.toLocaleString("sv-SE", {
                  maximumFractionDigits: 0,
                })}{" "}
                {t("common.kr")}
              </span>
            </div>

            {/* Sizes */}
            {hasSizes && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  {t("common.size")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={cn(
                        "min-w-10 h-8 px-2 rounded-md text-xs font-medium transition-all",
                        selectedSize === size
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 hover:bg-muted"
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedSize(size);
                      }}
                      aria-label={`${t("common.size")} ${size === "-" ? "–" : size}`}
                      aria-pressed={selectedSize === size}
                    >
                      {size === "-" ? "–" : size.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Colors */}
            {hasColors && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  {t("common.color")}
                </div>
                <div className="flex gap-2">
                  {product.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        "w-6 h-6 rounded-full transition-all",
                        selectedColor === color
                          ? "ring-2 ring-primary ring-offset-2"
                          : "ring-1 ring-muted hover:ring-primary",
                        color === "default" && "bg-neutral-300"
                      )}
                      style={
                        color !== "default" && /^#[0-9a-fA-F]{3,8}$/.test(color)
                          ? { backgroundColor: color }
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedColor(color);
                      }}
                      aria-label={`Select color ${color}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>

      </Card>
    </Link>
  );
};

export default ProductCard;
