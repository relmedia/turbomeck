"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useCartStore from "@/stores/cartStore";
import type { ProductType } from "@/types";
import { productUrl } from "@/lib/utils";
import { useWishlist } from "@/hooks/useWishlist";
import { fetchReviews } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";
import { Card, CardContent } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
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
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { CompareToggle } from "@/components/compare/CompareToggle";

const ProductCard: React.FC<{ product: ProductType; priority?: boolean }> = ({
  product,
  priority = false,
}) => {
  const t = useTranslation();
  const { price: displayPrice } = useCurrency();
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

  // The gallery is a native horizontal scroll-snap track, so a finger drag
  // scrolls it with the platform's own momentum and rubber-banding. The
  // chevrons (mouse only — `can-hover:` keeps them off touch devices, where
  // they would otherwise intercept the swipe) and the dots drive the same
  // track via scrollTo, and `currentImageIndex` is derived from the scroll
  // position so every control stays in sync.
  const trackRef = useRef<HTMLDivElement>(null);
  const programmaticScrollUntil = useRef(0);
  const swipedUntil = useRef(0);

  const scrollToIndex = useCallback(
    (index: number) => {
      const clamped = ((index % images.length) + images.length) % images.length;
      setCurrentImageIndex(clamped);
      const track = trackRef.current;
      if (!track) return;
      programmaticScrollUntil.current = performance.now() + 600;
      track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
    },
    [images.length],
  );

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // Intermediate events from our own smooth scroll would drag the active
    // index away from the target before the animation lands.
    if (performance.now() < programmaticScrollUntil.current) return;
    // A swipe ends in a click on the enclosing card link; swallow it so
    // browsing images never navigates away from the listing.
    swipedUntil.current = performance.now() + 350;
    const width = track.clientWidth;
    if (width === 0) return;
    const index = Math.round(track.scrollLeft / width);
    setCurrentImageIndex((prev) => (prev === index ? prev : index));
  }, []);

  // clientWidth is the snap unit, so a resize invalidates the scroll offset.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onResize = () => {
      programmaticScrollUntil.current = performance.now() + 200;
      track.scrollTo({
        left: currentImageIndex * track.clientWidth,
        behavior: "auto",
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [currentImageIndex]);

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    scrollToIndex(currentImageIndex + 1);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    scrollToIndex(currentImageIndex - 1);
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

  const cartLabel =
    attrs.length > 0 ? t("common.selectOptions") : t("common.addToCart");

  const reviewCount =
    typeof reviewStats === "object" ? reviewStats.totalCount : 0;

  return (
    <Link
      href={productUrl(product)}
      className="group block h-full"
      onClick={(e) => {
        if (performance.now() < swipedUntil.current) e.preventDefault();
      }}
    >
      <Card className="flex h-full w-full max-w-sm flex-col gap-0 overflow-hidden rounded-none border-0 bg-muted/40 p-0 text-foreground shadow-none transition-colors duration-300 hover:bg-muted/70">
        {/* The image sits ON the card's own panel rather than in a separate
            box, and is contained rather than cropped: a turbo photographed on
            white loses its housing to an object-cover crop. */}
        <div className="relative aspect-square overflow-hidden">
          {!imageLoaded && (
            <Skeleton className="pointer-events-none absolute inset-0 z-10 rounded-none" />
          )}
          <div
            ref={trackRef}
            onScroll={handleScroll}
            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {images.map((src, i) => (
              <div
                key={`${src}-${i}`}
                className="relative h-full w-full shrink-0 snap-center snap-always"
              >
                <ImageWithFallback
                  src={src}
                  alt=""
                  fill
                  priority={priority && i === 0}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  draggable={false}
                  className="object-contain p-3 transition-transform duration-500 group-hover:scale-[1.03]"
                  onLoad={i === 0 ? () => setImageLoaded(true) : undefined}
                />
              </div>
            ))}
          </div>

          {product.isExchangeTurbo === true && (
            <Badge
              variant="outline"
              className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-5rem)] items-center gap-1 truncate rounded-none border-transparent bg-foreground px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-background shadow-none"
              title={t("product.exchangeTurboBadge")}
            >
              <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{t("product.exchangeTurboBadge")}</span>
            </Badge>
          )}

          {/* Bare icons, no circular chips: the reference keeps the panel calm
              so the product is the only object on it.

              The chip is gone visually but NOT as a hit area — each control is
              still a 36px box with the icon centred in it. Shrinking the
              target to the 18px glyph would have made both unusable on a
              phone, which is the opposite of what this redesign is for. */}
          <div className="absolute right-2 top-2 z-20 flex flex-col">
            <button
              type="button"
              onClick={handleWishlist}
              aria-label={
                isInWishlist(Number(product.id))
                  ? t("wishlist.removeFromWishlist")
                  : t("wishlist.addToWishlist")
              }
              className="flex size-9 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <Heart
                className={cn(
                  "size-[18px]",
                  isInWishlist(Number(product.id)) && "fill-rose-500 text-rose-500"
                )}
                aria-hidden
              />
            </button>
            <CompareToggle
              productId={Number(product.id)}
              className="size-9 rounded-none bg-transparent text-muted-foreground shadow-none backdrop-blur-none hover:bg-transparent hover:text-foreground"
            />
          </div>

          {images.length > 1 && (
            <>
              {/* `hidden can-hover:flex` — display:none, so on a phone these
                  are not in the hit-test tree at all. They used to be rendered
                  at full opacity below `sm` and at opacity-0 above it, and in
                  both cases the two 32px buttons sat vertically centred on the
                  left and right edges of the image: exactly where a horizontal
                  swipe starts and ends. A drag beginning on one went to the
                  button instead of the scroll track, so swiping between images
                  did nothing. The track itself keeps touch-action:auto, which
                  is what lets the browser route a horizontal drag to the
                  gallery and a vertical one to the page. */}
              <div className="pointer-events-none absolute inset-0 hidden items-center justify-between p-2 opacity-0 transition-opacity can-hover:flex group-hover:opacity-100">
                <Button
                  variant="secondary"
                  size="icon"
                  className="pointer-events-auto h-8 w-8 shrink-0 cursor-pointer rounded-full bg-background/80 shadow-none backdrop-blur-sm"
                  onClick={prevImage}
                  aria-label={t("product.previousProductImage", { name: product.name })}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="pointer-events-auto h-8 w-8 shrink-0 cursor-pointer rounded-full bg-background/80 shadow-none backdrop-blur-sm"
                  onClick={nextImage}
                  aria-label={t("product.nextProductImage", { name: product.name })}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-0.5">
                {images.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className="pointer-events-auto flex cursor-pointer items-center justify-center px-1.5 py-2.5"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      scrollToIndex(index);
                    }}
                    aria-label={t("slider.goToSlide", { n: index + 1 })}
                    aria-current={index === currentImageIndex ? "true" : undefined}
                  >
                    <span
                      className={cn(
                        "block h-1.5 rounded-full transition-all",
                        index === currentImageIndex
                          ? "w-4 bg-foreground/70"
                          : "w-1.5 bg-foreground/25"
                      )}
                    />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {product.name}
          </h3>

          {/* Always rendered, even at zero reviews: a missing row made cards
              in the same grid row different shapes, and "0 recensioner" is
              itself information a shopper uses. */}
          {reviewStats === "loading" ? (
            <Skeleton className="h-3.5 w-28" />
          ) : (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-3.5 w-3.5",
                    reviewStats !== "error" &&
                      reviewStats.totalCount > 0 &&
                      i <= Math.round(reviewStats.averageRating)
                      ? "fill-amber-500 text-amber-500"
                      : "text-gray-300"
                  )}
                  aria-hidden
                />
              ))}
              <span className="ml-1 text-xs text-muted-foreground">
                ({reviewCount}{" "}
                {reviewCount === 1 ? t("common.review") : t("common.reviews")})
              </span>
            </div>
          )}

          {/* Prose only — the spec sheet belongs on the product page, not in
              the grid. Clamped to three lines so cards in the same row keep
              the same shape whatever the summary length. */}
          {product.shortDescription && (
            <p className="line-clamp-3 text-sm leading-snug text-muted-foreground">
              {product.shortDescription}
            </p>
          )}

          {hasSizes && (
            <div className="flex flex-wrap gap-1.5">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={cn(
                    "h-7 min-w-9 rounded-none px-2 text-xs font-medium transition-colors",
                    selectedSize === size
                      ? "bg-foreground text-background"
                      : "bg-background/70 hover:bg-background"
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
          )}

          {hasColors && (
            <div className="flex gap-2">
              {product.colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "size-5 rounded-full transition-all",
                    selectedColor === color
                      ? "ring-2 ring-foreground ring-offset-2"
                      : "ring-1 ring-muted-foreground/30 hover:ring-foreground",
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
                  aria-label={`${t("common.color")} ${color}`}
                  aria-pressed={selectedColor === color}
                />
              ))}
            </div>
          )}

          {/* mt-auto pins this row to the bottom, so price and button line up
              across a row of cards whatever the name or spec lengths. */}
          <div className="mt-auto flex items-end justify-between gap-3 pt-1">
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight">
                {displayPrice(product.price)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("product.inclVat")}
              </p>
            </div>

            {/* Always visible, not revealed on hover. The old card put
                add-to-cart behind group-hover, which no touch device can ever
                trigger — it was unreachable on a phone. */}
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={isAddingToCart}
              aria-label={cartLabel}
              title={cartLabel}
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[3px] bg-gray-900 text-white transition-colors duration-200 hover:bg-gray-700 active:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAddingToCart ? (
                <Loader2 className="size-[18px] animate-spin" aria-hidden />
              ) : (
                <ShoppingCart className="size-[18px]" aria-hidden />
              )}
            </button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default ProductCard;
