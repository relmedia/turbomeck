"use client";
import type { CATEGORIES_QUERYResult, Product } from "@/sanity.types";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { client } from "@/sanity/lib/client";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import NoProductAvailable from "./NoProductAvailable";

interface Props {
  categories: CATEGORIES_QUERYResult;
  slug: string;
}

const PRODUCTS_PER_PAGE = 8; // Adjust this number as needed

const CategoryProducts = ({ categories, slug }: Props) => {
  const [currentSlug, setCurrentSlug] = useState(slug);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  const fetchProducts = async (categorySlug: string, page: number) => {
    try {
      setLoading(true);
      const query = `{
        "products": *[_type == 'product' && references(*[_type == "category" && slug.current == $categorySlug]._id)] | order(name asc) [$start...$end],
        "total": count(*[_type == 'product' && references(*[_type == "category" && slug.current == $categorySlug]._id)])
      }`;

      const { products, total } = await client.fetch(query, {
        categorySlug,
        start: (page - 1) * PRODUCTS_PER_PAGE,
        end: page * PRODUCTS_PER_PAGE,
      });

      setProducts(products);
      setTotalProducts(total);
    } catch (error) {
      console.error("Error fetching products:", error);
      setProducts([]);
      setTotalProducts(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when category changes
    fetchProducts(currentSlug, 1);
  }, [currentSlug]);

  useEffect(() => {
    fetchProducts(currentSlug, currentPage);
  }, [currentPage]);

  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  return (
    <div className="py-10 flex flex-col md:flex-row gap-5">
      <div className="flex flex-row md:min-w-40 md:flex-col md:gap-0 gap-5">
        {categories?.map((item) => (
          <Button
            key={item?._id}
            onClick={() => setCurrentSlug(item?.slug?.current as string)}
            className={`border-none justify-start px-0 bg-transparent md:border-r-1 rounded-none text-darkColor shadow-none hover:text-lightGreen hover:border-r-darkColor/50 hover:bg-white font-semibold hoverEffect ${item?.slug?.current === currentSlug && "text-lightGreen border-r-lightGreen"}`}>
            {item?.title}
          </Button>
        ))}
      </div>
      <div className="w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 min-h-80 space-y-4 text-center bg-gray-100 rounded-lg w-full">
            <motion.div className="flex items-center space-x-2 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Product is loading...</span>
            </motion.div>
          </div>
        ) : products?.length ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {products?.map((product: Product) => (
                <AnimatePresence key={product?._id}>
                  <motion.div
                    layout
                    initial={{ opacity: 0.2 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}>
                    <ProductCard key={product?._id} product={product} />
                  </motion.div>
                </AnimatePresence>
              ))}
            </div>
            <div className="mt-6 flex justify-center items-center space-x-4">
              <Button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>{`Sida ${currentPage} av ${totalPages}`}</span>
              <Button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <NoProductAvailable
            selectedTab={currentSlug}
            className="mt-0 w-full"
          />
        )}
      </div>
    </div>
  );
};

export default CategoryProducts;
