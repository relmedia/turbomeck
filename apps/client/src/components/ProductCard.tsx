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
import {
  Heart,
  ShoppingCart,
  Star,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { ImageWithFallback } from "./ImageWithFallback";
import { toast } from "react-toastify";
import { useTranslation } from "@/i18n/context";

const ProductCard: React.FC<{ product: ProductType }> = ({ product }) => {
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

  const images =
    product.galleryImages && product.galleryImages.length > 0
      ? product.galleryImages
      : [product.images?.default || "/logo.svg"];

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
          {product.depositAmount != null && product.depositAmount > 0 && (
            <span className="absolute top-3 left-3 z-20 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-md">
              Utbytes
            </span>
          )}
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
              src={images[currentImageIndex]}
              alt={`${product.name} - View ${currentImageIndex + 1}`}
              fill
              className="object-cover"
              onLoad={() => setImageLoaded(true)}
            />
          </motion.div>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <div className="absolute inset-0 flex items-center justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="secondary"
                size="icon"
className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-none shrink-0"
                  onClick={prevImage}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-none shrink-0"
                  onClick={nextImage}
              >
                <ChevronRight className="h-4 w-4" />
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
                ? "Ta bort från önskelista"
                : "Lägg till i önskelista"
            }
          >
            <Heart
              className={cn(
                "h-4 w-4",
                isInWishlist(Number(product.id)) && "fill-rose-500"
              )}
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
                    aria-label={`View image ${index + 1}`}
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
                      ({reviewStats !== "error" ? reviewStats.totalCount : 0}{" "}
                      {reviewStats.totalCount === 1
                        ? t("common.review")
                        : t("common.reviews")})
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
