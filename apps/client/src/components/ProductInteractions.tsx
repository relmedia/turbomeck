"use client";

import useCartStore from "@/stores/cartStore";
import { ProductType } from "@/types";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

const ProductInteraction = ({
  product,
  selectedSize,
  selectedColor,
  selectedVariant,
  onVariantChange,
}: {
  product: ProductType;
  selectedSize: string;
  selectedColor: string;
  selectedVariant?: string;
  onVariantChange?: (value: string) => void;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [quantity, setQuantity] = useState(1);
  const [variant, setVariant] = useState(selectedVariant ?? "");

  const { addToCart } = useCartStore();
  const t = useTranslation();
  const hasSizes = product.sizes.length > 1 && product.sizes[0] !== "-";
  const hasColors = product.colors.length > 1 && product.colors[0] !== "default";
  const attributes = product.attributes ?? [];
  const attrsWithOptions = attributes.filter((a) => a.options.length > 0);
  const hasAttributes = attrsWithOptions.length > 0;
  const allOptions = Array.from(
    new Map(
      attrsWithOptions.flatMap((a) =>
        a.options.map((opt) => {
          const value = `${a.name}: ${opt}`;
          return [value, { value, label: opt }] as const;
        })
      )
    ).values()
  );

  const handleTypeChange = (type: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(type, value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleQuantityChange = (type: "increment" | "decrement") => {
    if (type === "increment") {
      setQuantity((prev) => prev + 1);
    } else {
      if (quantity > 1) {
        setQuantity((prev) => prev - 1);
      }
    }
  };

  const addProductToCart = () => {
    if (hasAttributes && !variant) {
      toast.error(t("product.selectSizeBeforeCart"));
      return false;
    }
    addToCart({
      ...product,
      quantity,
      selectedColor,
      selectedSize,
      selectedVariant: hasAttributes ? variant : undefined,
    });
    return true;
  };

  const handleAddToCart = () => {
    if (addProductToCart()) toast.success(t("product.addedToCart"));
  };

  const handleBuyNow = () => {
    if (addProductToCart()) router.push("/cart");
  };
  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* SIZE */}
      {hasSizes && (
        <div className="flex flex-col gap-2 text-xs">
          <span className="text-gray-500">{t("common.size")}</span>
          <div className="flex items-center gap-2">
            {product.sizes.map((size) => (
              <div
                className={`cursor-pointer border-1 p-[2px] ${
                  selectedSize === size ? "border-gray-600" : "border-gray-300"
                }`}
                key={size}
                onClick={() => handleTypeChange("size", size)}
              >
                <div
                  className={`w-6 h-6 text-center flex items-center justify-center ${
                    selectedSize === size
                      ? "bg-black text-white"
                      : "bg-white text-black"
                  }`}
                >
                  {size.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ATTRIBUTES (e.g. Typ: 13C, 13T) - single select with all options */}
      {hasAttributes && (
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-gray-500 block">{t("common.size")}</span>
          <select
            value={variant}
            onChange={(e) => {
              const v = e.target.value;
              setVariant(v);
              onVariantChange?.(v);
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
          >
            <option value="">{t("product.selectSize")}</option>
            {allOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* COLOR */}
      {hasColors && (
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-gray-500">{t("common.color")}</span>
          <div className="flex items-center gap-2">
            {product.colors.map((color) => (
              <div
                className={`cursor-pointer border-1 p-[2px] ${
                  selectedColor === color ? "border-gray-300" : "border-white"
                }`}
                key={color}
                onClick={() => handleTypeChange("color", color)}
              >
                <div className="w-6 h-6" style={{ backgroundColor: color }} />
              </div>
            ))}
          </div>
        </div>
      )}
      {/* QUANTITY */}
      <div className="flex flex-col gap-2 text-sm">
        <span className="text-gray-500">Antal</span>
        <div className="flex items-center gap-2">
          <button
            className="cursor-pointer border-1 border-gray-300 p-1"
            onClick={() => handleQuantityChange("decrement")}
          >
            <Minus className="w-4 h-4" />
          </button>
          <span>{quantity}</span>
          <button
            className="cursor-pointer border-1 border-gray-300 p-1"
            onClick={() => handleQuantityChange("increment")}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* BUTTONS */}
      <button
        onClick={handleAddToCart}
        className="bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg flex items-center justify-center gap-2 cursor-pointer text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        {t("common.addToCart")}
      </button>
      <button
        onClick={handleBuyNow}
        className="ring-1 ring-gray-400 shadow-lg text-gray-800 px-4 py-2 rounded-md flex items-center justify-center cursor-pointer gap-2 text-sm font-medium"
      >
        <ShoppingCart className="w-4 h-4" />
        {t("product.buyNow")}
      </button>
    </div>
  );
};

export default ProductInteraction;
