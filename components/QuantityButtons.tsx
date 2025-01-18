import React from "react";
import { Button } from "./ui/button";
import { HiMinus, HiPlus } from "react-icons/hi2";
import toast from "react-hot-toast";
import useCartStore from "@/store";
import { Product } from "@/sanity.types";
import { twMerge } from "tailwind-merge";

interface Props {
  product: Product;
  className?: string;
  borderStyle?: string;
}

const QuantityButtons = ({ product, className, borderStyle }: Props) => {
  const { addItem, removeItem, getItemCount } = useCartStore();
  const itemCount = getItemCount(product?._id);
  const isOutOfStock = product?.stock === 0;

  const handleRemoveProduct = () => {
    removeItem(product?._id);
    if (itemCount > 1) {
      toast.success("Antal produkter minskades!");
    } else {
      toast.success(`${product?.name?.substring(0, 12)} är borttagen!`);
    }
  };
  return (
    <div
      className={twMerge(
        "flex items-center gap-1 pb-1 text-base",
        borderStyle,
        className
      )}>
      <Button
        variant="outline"
        size="icon"
        className="w-6 h-6"
        onClick={handleRemoveProduct}
        disabled={itemCount === 0 || isOutOfStock}>
        <HiMinus />
      </Button>
      <span className="font-semibold w-8 text-center text-darkColor">
        {itemCount}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="w-6 h-6"
        onClick={() => {
          addItem(product);
          toast.success("Antal produkter ökades!");
        }}
        disabled={isOutOfStock}>
        <HiPlus />
      </Button>
    </div>
  );
};

export default QuantityButtons;
