"use client";

import { useEffect, useState } from "react";
import useCartStore from "@/stores/cartStore";
import { ProductType } from "@repo/types";
import { productUrl } from "@/lib/utils";
import { useWishlist } from "@/hooks/useWishlist";
import { fetchReviews } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Heart, Star } from "lucide-react";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import Link from "next/link";
import { toast } from "react-toastify";
import { useTranslation } from "@/i18n/context";

const ProductCard: React.FC<{ product: ProductType }> = ({ product }) => {
  const t = useTranslation();
  const [imageLoaded, setImageLoaded] = useState(false);
  const { toggle: toggleWishlist, isInWishlist, isSignedIn } = useWishlist();
  const hasVariants =
    (product.sizes.length > 1 || product.sizes[0] !== "-") &&
    (product.colors.length > 1 || product.colors[0] !== "default");
  const [productTypes, setProductTypes] = useState({
    size: product.sizes[0],
    color: product.colors[0],
  });

  const { addToCart } = useCartStore();
  const [reviewStats, setReviewStats] = useState<{
    averageRating: number;
    totalCount: number;
  } | "loading" | "error">("loading");

  useEffect(() => {
    const pid = Number(product.id);
    if (!pid) {
      setReviewStats({ averageRating: 0, totalCount: 0 });
      return;
    }
    fetchReviews(pid)
      .then(({ averageRating, totalCount }) => setReviewStats({ averageRating, totalCount }))
      .catch(() => setReviewStats("error"));
  }, [product.id]);

  const handleProductType = ({
    type,
    value,
  }: {
    type: "size" | "color";
    value: string;
  }) => {
    setProductTypes((prev) => ({
      ...prev,
      [type]: value,
    }));
  };

  const handleAddToCart = () => {
    addToCart({
      ...product,
      quantity: 1,
      selectedSize: productTypes.size,
      selectedColor: productTypes.color,
    });
    toast.success(t("product.addedToCart"));
  };

  return (
    <div className="flex flex-col h-full shadow-lg rounded-lg overflow-hidden">
      {/* IMAGE */}
      <Link href={productUrl(product)}>
        <div className="relative aspect-[4/3] overflow-hidden bg-muted shrink-0 group">
          {!imageLoaded && (
            <Skeleton className="absolute inset-0 z-0 rounded-none" />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isSignedIn) {
                toast.info(t("product.loginToSave"));
                return;
              }
              const wasInList = isInWishlist(Number(product.id));
              toggleWishlist(Number(product.id));
              toast.success(wasInList ? t("product.removedFromWishlist") : t("product.addedToWishlist"));
            }}
            className="absolute top-2 right-2 z-10 p-2 rounded-full bg-background/80 hover:bg-background transition-colors"
            aria-label={isInWishlist(Number(product.id)) ? "Ta bort från önskelista" : "Lägg till i önskelista"}
          >
            <Heart
              className={`w-4 h-4 ${isInWishlist(Number(product.id)) ? "fill-red-500 text-red-500" : ""}`}
            />
          </button>
          <ImageWithFallback
            src={product.images?.[productTypes.color] || "/logo.svg"}
            alt={product.name}
            fill
            className="object-cover hover:scale-[1.02] transition-all duration-300 relative z-10"
            onLoad={() => setImageLoaded(true)}
          />
        </div>
      </Link>
      {/* PRODUCT DETAIL */}
      <div className="flex flex-col gap-4 p-4 flex-1 min-h-0">
        <h1 className="font-medium">{product.name}</h1>
        <div className="flex items-center gap-1.5">
          {reviewStats === "loading" ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => {
                  const filled =
                    reviewStats !== "error" &&
                    reviewStats.totalCount > 0 &&
                    i <= Math.round(reviewStats.averageRating);
                  return (
                    <Star
                      key={i}
                      className={cn(
                        "h-4 w-4",
                        filled ? "fill-black text-black" : "text-gray-200"
                      )}
                    />
                  );
                })}
              </div>
              {reviewStats !== "error" && (
            <span className="text-xs text-gray-500">
              ({reviewStats.totalCount} {reviewStats.totalCount === 1 ? t("common.review") : t("common.reviews")})
                </span>
              )}
            </>
          )}
        </div>
        <p className="text-sm text-gray-500 line-clamp-2">{product.shortDescription}</p>
        {/* PRODUCT TYPES */}
        {hasVariants && (
          <div className="flex items-center gap-4 text-xs">
            {product.sizes.length > 1 && (
              <div className="flex flex-col gap-1">
                <span className="text-gray-500">{t("common.size")}</span>
                <select
                  name="size"
                  id="size"
                  className="ring ring-gray-300 rounded-md px-2 py-1"
                  onChange={(e) =>
                    handleProductType({ type: "size", value: e.target.value })
                  }
                >
                  {product.sizes.map((size) => (
                    <option key={size} value={size}>
                      {size.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {product.colors.length > 1 && (
              <div className="flex flex-col gap-1">
                <span className="text-gray-500">{t("common.color")}</span>
                <div className="flex items-center gap-2">
                  {product.colors.map((color) => (
                    <div
                      className={`cursor-pointer border-1 ${
                        productTypes.color === color
                          ? "border-gray-400 "
                          : "border-gray-200"
                      } rounded-full p-[1.2px]`}
                      key={color}
                      onClick={() =>
                        handleProductType({ type: "color", value: color })
                      }
                    >
                      <div
                        className="w-[14px] h-[14px] rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* PRICE AND ADD TO CART BUTTON */}
        <div className="flex items-center justify-between mt-auto">
          <p className="font-medium">
            {product.price.toLocaleString("sv-SE", {
              maximumFractionDigits: 0,
            })}{" "}
            {t("common.kr")}
          </p>
          <button
            onClick={handleAddToCart}
            className="ring-1 ring-gray-200 shadow-lg rounded-md  px-2 py-1 text-sm cursor-pointer hover:text-white cart-button transition-all duration-300 flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            {t("common.addToCart")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
