import { Product } from "@/sanity.types";
import { urlFor } from "@/sanity/lib/image";
import Image from "next/image";
import React from "react";
import PriceView from "./PriceView";
import Link from "next/link";
import AddToCartButton from "./AddToCartButton";
import Title from "./Title";

const ProductCard = ({ product }: { product: Product }) => {
  return (
    <div className="rounded-lg overflow-hidden group text-sm">
      <div className="overflow-hidden relative bg-gradient-to-r from-zinc-200 via-zinc-300 to-zinc-200">
        {product?.images && (
          <Link href={`/product/${product?.slug?.current}`}>
            <Image
              src={urlFor(product.images[0]).url()}
              alt="productImage"
              width={500}
              height={500}
              // loading="lazy"
              priority
              className={`w-full h-72 object-contain overflow-hidden  transition-transform duration-500 ${product?.stock !== 0 && "group-hover:scale-105"}`}
            />
          </Link>
        )}
      </div>
      <div className="py-3 px-2 flex flex-col gap-1.5 bg-zinc-50 border border-t-0 rounded-md rounded-tl-none rounded-tr-none">
        <Title className="text-base line-clamp-1">{product?.name}</Title>
        <p>{product?.intro}</p>
        <PriceView
          price={product?.price}
          discount={product?.discount}
          className="text-lg"
        />
        <AddToCartButton product={product} />
      </div>
    </div>
  );
};

export default ProductCard;
