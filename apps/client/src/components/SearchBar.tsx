"use client";

import { Search } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import Link from "next/link";
import { ProductType } from "@/types";
import { productUrl } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/api";

const DEBOUNCE_MS = 300;
const SEARCH_DEBOUNCE_MS = 200;
const MAX_DROPDOWN_RESULTS = 8;

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .trim();
}

/** Match at word boundary to avoid "tur" matching "fakturera" */
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

  // Product name MUST match at least one search word (avoids irrelevant description matches)
  const nameMatchesSome = words.some((w) => wordMatchesText(nameNorm, w));
  if (!nameMatchesSome) return 0;

  // All query words must match in name or shortDescription (word boundaries)
  const allWordsMatch = words.every(
    (w) => wordMatchesText(nameNorm, w) || wordMatchesText(shortDescNorm, w)
  );
  if (!allWordsMatch) return 0;

  // Score: name matches ranked higher
  let score = 0;
  for (const w of words) {
    if (wordMatchesText(nameNorm, w)) {
      score += 100;
      if (nameNorm.startsWith(w) || nameNorm.includes(" " + w))
        score += 20;
    }
    if (wordMatchesText(shortDescNorm, w)) score += 10;
  }
  return score;
}

const SearchBar = () => {
  const t = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const [query, setQuery] = useState(searchFromUrl);
  const [dropdownProducts, setDropdownProducts] = useState<ProductType[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<ProductType[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams);
  const containerRef = useRef<HTMLDivElement>(null);
  searchParamsRef.current = searchParams;

  // Sync query from URL
  useEffect(() => {
    setQuery(searchFromUrl);
  }, [searchFromUrl]);

  // Fetch all products once for dropdown search
  useEffect(() => {
    let cancelled = false;
    fetch("/api/product/products")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const products: ProductType[] = (Array.isArray(data) ? data : []).map((p: { id: number; slug?: string; name: string; shortDescription?: string; description?: string; price: number; image?: string | null; thumbnails?: string[]; isExchangeTurbo?: boolean }) => {
          const img = resolveImageUrl(p.image || p.thumbnails?.[0] || null);
          return {
            id: p.id,
            slug: p.slug,
            name: p.name,
            shortDescription: p.shortDescription || "",
            description: p.description || "",
            price: p.price,
            isExchangeTurbo: p.isExchangeTurbo === true,
            images: { default: img },
            galleryImages: [img],
            sizes: ["-"] as [string, ...string[]],
            colors: ["default"] as [string, ...string[]],
          };
        });
        setAllProducts(products);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Filter products for dropdown when query changes
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      if (!allProducts || query.trim().length < 3) {
        setDropdownProducts([]);
        setIsDropdownOpen(false);
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
      setIsDropdownOpen(true);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query, allProducts]);

  // URL sync when on searchable pages
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const isSearchablePage = pathname === "/" || pathname === "/products";
      if (!isSearchablePage) return;

      const q = query.trim();
      const params = new URLSearchParams(searchParamsRef.current);
      if (q) {
        params.set("search", q);
        params.delete("page");
      } else {
        params.delete("search");
        params.delete("page");
      }
      const targetPath = pathname === "/products" ? "/products" : "/";
      const queryString = params.toString();
      const newUrl = queryString ? `${targetPath}?${queryString}` : targetPath;
      const currentUrl = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
      const targetFull = targetPath + (queryString ? `?${queryString}` : "");
      if (currentUrl !== targetFull) {
        router.replace(newUrl, { scroll: false });
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, pathname, router]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectProduct = useCallback((product: ProductType) => {
    setIsDropdownOpen(false);
    setQuery("");
    router.push(productUrl(product));
  }, [router]);

  const showDropdown = isDropdownOpen && query.trim().length >= 3;

  return (
    <div ref={containerRef} className="hidden sm:block relative min-w-[280px] max-w-[520px] w-full">
      <div className="flex items-center gap-2 rounded-md ring-1 ring-gray-200 px-2 py-1.5 bg-white">
        <Search className="w-4 h-4 text-gray-500 shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 3 && setIsDropdownOpen(true)}
          placeholder={t("search.placeholder")}
          className="text-sm outline-0 bg-transparent w-full"
          aria-label={t("search.placeholder")}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
        />
      </div>

      {showDropdown && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden"
        >
          {dropdownProducts.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("search.noResults")}
            </div>
          ) : (
            <>
              <ul className="max-h-[280px] overflow-y-auto py-1" role="listbox">
                {dropdownProducts.map((product) => (
                  <li key={product.id} role="option">
                    <Link
                      href={productUrl(product)}
                      onClick={(e) => {
                        e.preventDefault();
                        handleSelectProduct(product);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="relative w-10 h-10 shrink-0 rounded overflow-hidden bg-gray-100">
                        <ImageWithFallback
                          src={product.images?.default || product.galleryImages?.[0] || "/logo.svg"}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs text-gray-500">
                          {product.price.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} {t("common.kr")}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={pathname === "/products" ? `/products?search=${encodeURIComponent(query.trim())}` : `/?search=${encodeURIComponent(query.trim())}`}
                onClick={() => setIsDropdownOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-center border-t border-gray-100 hover:bg-gray-50 transition-colors"
              >
                {t("search.viewAllResults")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
