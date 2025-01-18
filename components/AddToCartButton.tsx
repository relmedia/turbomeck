"use client";
import { Product } from "@/sanity.types";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import PriceFormatter from "./PriceFormatter";
import { Button } from "./ui/button";
import useCartStore from "@/store";
import QuantityButtons from "./QuantityButtons";
import { cn } from "@/lib/utils";

interface Props {
  product: Product;
  className?: string;
}

const AddToCartButton = ({ product, className }: Props) => {
  const { addItem, getItemCount } = useCartStore();
  const [isClient, setIsClient] = useState(false);

  const itemCount = getItemCount(product?._id);
  const isOutOfStock = product?.stock === 0;

  // Use useEffect to set isClient to true after component mounts
  // This ensures that the component only renders on the client-side
  // Preventing hydration errors due to server/client mismatch

  useEffect(() => {
    setIsClient(true);
  }, []);
  if (!isClient) {
    return null;
  }
  return (
    <div className="w-full h-12 flex items-center">
      {itemCount ? (
        <div className="text-sm w-full">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Antal</span>
            <QuantityButtons product={product} />
          </div>
          <div className="flex items-center justify-between border-t pt-1">
            <span className="text-xs font-semibold">Delsumma</span>
            <PriceFormatter
              amount={product?.price ? product.price * itemCount : 0}
            />
          </div>
        </div>
      ) : (
        <Button
          onClick={() => {
            addItem(product);
            toast.success(
              `${product?.name?.substring(0, 20)}... har lagts till i varukorgen!`
            );
          }}
          disabled={isOutOfStock}
          className={cn(
            "w-full bg-transparent text-darkColor shadow-none border border-darkColor/30 font-semibold tracking-wide hover:text-white hoverEffect",
            className
          )}>
          Lägg i varukorgen
        </Button>
      )}
    </div>
  );
};

export default AddToCartButton;
