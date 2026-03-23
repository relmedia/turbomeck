"use client";

import { Search, X } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import Link from "next/link";
import { ProductType } from "@/types";
import { productUrl } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/api";

const SEARCH_DEBOUNCE_MS = 200;
const MAX_DROPDOWN_RESULTS = 8;

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .trim();
}

function wordMatchesText(normText: string, normWord: string): boolean {
  if (normWord.length < 2) return normText.includes(normWord);
  const escaped = normWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + escaped).test(normText);
}

function getSearchRelevance(p: ProductType, q: string): number {
  const words = normalizeForSearch(q).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const nameNorm = normalizeForSearch(p.name);
  const shortDescNorm = normalizeForSearch(p.shortDescription || "");

  const nameMatchesSome = words.some((w) => wordMatchesText(nameNorm, w));
  if (!nameMatchesSome) return 0;

  const allWordsMatch = words.every(
    (w) => wordMatchesText(nameNorm, w) || wordMatchesText(shortDescNorm, w)
  );
  if (!allWordsMatch) return 0;

  let score = 0;
  for (const w of words) {
    if (wordMatchesText(nameNorm, w)) {
      score += 100;
      if (nameNorm.startsWith(w) || nameNorm.includes(" " + w)) score += 20;
    }
    if (wordMatchesText(shortDescNorm, w)) score += 10;
  }
  return score;
}

export function MobileSearch() {
  const t = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownProducts, setDropdownProducts] = useState<ProductType[]>([]);
  const [allProducts, setAllProducts] = useState<ProductType[] | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all products once
  useEffect(() => {
    if (!isOpen || allProducts) return;
    let cancelled = false;
    fetch("/api/product/products")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const products: ProductType[] = (Array.isArray(data) ? data : []).map(
          (p: {
            id: number;
            slug?: string;
            name: string;
            shortDescription?: string;
            description?: string;
            price: number;
            image?: string | null;
            thumbnails?: string[];
          }) => {
            const img = resolveImageUrl(p.image || p.thumbnails?.[0] || null);
            return {
              id: p.id,
              slug: p.slug,
              name: p.name,
              shortDescription: p.shortDescription || "",
              description: p.description || "",
              price: p.price,
              images: { default: img },
              galleryImages: [img],
              sizes: ["-"] as [string, ...string[]],
              colors: ["default"] as [string, ...string[]],
            };
          }
        );
        setAllProducts(products);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, allProducts]);

  // Filter products when query changes
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      if (!allProducts || query.trim().length < 3) {
        setDropdownProducts([]);
        return;
      }
      const q = query.trim();
      const scored = allProducts
        .map((p) => ({ product: p, score: getSearchRelevance(p, q) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_DROPDOWN_RESULTS)
        .map(({ product }) => product);
      setDropdownProducts(scored);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query, allProducts]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelectProduct = useCallback(
    (product: ProductType) => {
      setIsOpen(false);
      setQuery("");
      router.push(productUrl(product));
    },
    [router]
  );

  const handleClose = () => {
    setIsOpen(false);
    setQuery("");
    setDropdownProducts([]);
  };

  const showResults = query.trim().length >= 3;

  return (
    <>
      {/* Search icon button - only visible on mobile */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="sm:hidden p-1"
        aria-label={t("search.placeholder")}
      >
        <Search className="w-5 h-5 text-gray-600" />
      </button>

      {/* Full-screen search overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-white sm:hidden">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-200">
              <Search className="w-5 h-5 text-gray-500 shrink-0" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                className="flex-1 text-base outline-none bg-transparent"
                aria-label={t("search.placeholder")}
              />
              <button
                type="button"
                onClick={handleClose}
                className="p-1"
                aria-label="Stäng"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {showResults && dropdownProducts.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  {t("search.noResults")}
                </div>
              )}
              {showResults && dropdownProducts.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {dropdownProducts.map((product) => (
                    <li key={product.id}>
                      <Link
                        href={productUrl(product)}
                        onClick={(e) => {
                          e.preventDefault();
                          handleSelectProduct(product);
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100"
                      >
                        <div className="relative w-12 h-12 shrink-0 rounded overflow-hidden bg-gray-100">
                          <ImageWithFallback
                            src={
                              product.images?.default ||
                              product.galleryImages?.[0] ||
                              "/logo.svg"
                            }
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {product.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {product.price.toLocaleString("sv-SE", {
                              maximumFractionDigits: 0,
                            })}{" "}
                            {t("common.kr")}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {showResults && dropdownProducts.length > 0 && (
                <Link
                  href={
                    pathname === "/products"
                      ? `/products?search=${encodeURIComponent(query.trim())}`
                      : `/?search=${encodeURIComponent(query.trim())}`
                  }
                  onClick={handleClose}
                  className="block px-4 py-3 text-sm font-medium text-center border-t border-gray-100 text-primary"
                >
                  {t("search.viewAllResults")}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
