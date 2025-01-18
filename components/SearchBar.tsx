"use client";

import { Loader2, Search, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { client } from "@/sanity/lib/client";
import { Product } from "@/sanity.types";
import Link from "next/link";
import Image from "next/image";
import { urlFor } from "@/sanity/lib/image";
import PriceView from "./PriceView";
import AddToCartButton from "./AddToCartButton";

const SearchBar = () => {
  const [search, setsearch] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const fetchProducts = useCallback(async () => {
    if (!search) {
      setProducts([]);
      return;
    }
    setLoading(true);
    try {
      const query = `*[_type  == "product" && name match $search] | order(name asc)`;
      const params = { search: `${search}*` };
      const response = await client.fetch(query, params);
      setProducts(response);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchProducts();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [search, fetchProducts]);

  return (
    <Dialog open={showSearch} onOpenChange={() => setShowSearch(!showSearch)}>
      <DialogTrigger onClick={() => setShowSearch(!showSearch)}>
        <Search className="w-5 h-5 hover:text-darkColor hoverEffect" />
      </DialogTrigger>
      <DialogContent className="max-w-5xl h-auto flex flex-col overflow-hidden]">
        <DialogHeader>
          <DialogTitle className="mb-1">Produkt sök</DialogTitle>
          <form className="relative" onSubmit={(e) => e.preventDefault()}>
            <Input
              placeholder="Sök efter produkter..."
              className="flex-1 rounded-md py-5"
              value={search}
              onChange={(e) => setsearch(e.target.value)}
            />{" "}
            {search && (
              <X
                onClick={() => setsearch("")}
                className="w-4 h-4 absolute top-3 right-11 hover:text-red-600 hoverEffect"
              />
            )}
            <button
              type="submit"
              className={`absolute right-0 top-0 w-10 h-full flex items-center justify-center rounded-tr-md rounded-br-md
              hover:bg-neutral-800 hover:text-white hoverEffect" ${search ? "bg-neutral-800 text-white" : "bg-neutral-800/10"}`}>
              <Search className="w-5 h-5" />
            </button>
          </form>
        </DialogHeader>
        <div className="w-full h-full overflow-y-auto border border-neutral-800/20 rounded-md">
          <div>
            {loading ? (
              <p className="flex items-center px-6 py-10 gap-1 text-center text-darkColor font-semibold">
                <Loader2 className="w-5 h-5 animate-spin" />
                Sökning efter produkter pågår...
              </p>
            ) : products.length ? (
              products.map((products: Product) => (
                <div
                  key={products?._id}
                  className="bg-white overflow-hidden border-b last:border-b-0">
                  <div className="flex items-center p-1">
                    <Link
                      href={`/product/${products?.slug?.current}`}
                      className="h-20 w-20 md:h-24 md:w-24 flex-shrink-0 overflow-hidden group"
                      onClick={() => setShowSearch(false)}>
                      {products?.images && (
                        <Image
                          width={200}
                          height={200}
                          src={urlFor(products?.images[0]).url()}
                          alt="productImage"
                          className="object-cover w-full h-full group-hover:scale-110 hoverEffect"
                        />
                      )}
                    </Link>
                    <div className="px-4 py-2 flex-grow">
                      <Link
                        href={`/product/${products?.slug?.current}`}
                        onClick={() => setShowSearch(false)}>
                        <h3 className="text-sm md:text-lg font-semibold text-gray-800 line-clamp-1">
                          {products?.name}
                        </h3>
                        <p className="text-sm text-gray-600 line-clamp-1">
                          {products?.intro}
                        </p>
                      </Link>
                    </div>
                    <div className="w-60 mt-1 mr-3">
                      <PriceView
                        price={products?.price}
                        discount={products?.discount}
                        className="md:text-lg"
                      />
                      <AddToCartButton product={products} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 font-semibold tracking-wide">
                {search && !loading ? (
                  <p>
                    Inga produkter hittades för:{" "}
                    <span className="underline text-red-600">{search}</span>.
                    Försök med ett annat sökord.
                  </p>
                ) : (
                  <p className="text-neutral-800/70 flex items-center justify-center gap-1">
                    <Search className="w-5 h-4 " />
                    Sök och utforska produkter från Turbomeck
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchBar;
