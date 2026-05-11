"use client";

import { useEffect, useState } from "react";
import Categories from "./Categories";
import { useLanguage } from "@/i18n/context";
import { fetchCategories } from "@/lib/api";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

/**
 * Self-fetching wrapper around <Categories variant="inline" /> for use
 * inside the global <Navbar />. Categories are loaded on mount so the
 * navbar doesn't need each page to thread the categories prop down.
 *
 * On screens below `lg`, <Categories variant="inline" /> renders nothing
 * (it's `hidden lg:flex`) and <MobileMenu /> takes over for category nav,
 * so this component returns null on small viewports during loading too.
 */
export function NavCategoriesInline() {
  const { locale } = useLanguage();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCategories(locale)
      .then((c) => {
        if (cancelled) return;
        setCategories(c);
      })
      .catch((err) => {
        console.error("Failed to fetch categories for navbar:", err);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!loaded) {
    return (
      <div
        aria-hidden
        className="hidden lg:block h-9 w-64 rounded-md bg-muted/40"
      />
    );
  }

  return <Categories categories={categories} variant="inline" />;
}
