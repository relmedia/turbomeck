"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { categorySlug } from "@/lib/utils";
import { BRAND, INK_GRADIENT } from "@/lib/brand";
import { SectionHeading } from "./SectionHeading";

/**
 * "Browse by category" grid for the landing page.
 *
 * Shape follows the data, not a template: this shop has exactly three real
 * top-level categories (two car makes and a parts tree), so the grid is 3-up on
 * desktop and fills the row instead of leaving a gap. The "Alla Produkter" root
 * is filtered out — it is a container, not something to browse into.
 *
 * Each card shows its subcategories as chips, because in a parts shop the
 * model ("Saab 9-5") is what people actually look for, and surfacing them turns
 * one click into none. Chips are plain links, so they work without JS.
 *
 * Links use the existing `?category=<slug>` contract and `categorySlug()`, the
 * same pair used by ProductDetailContent and the sidebar filter, so a card and
 * the filter rail always resolve to the same view.
 */

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

/** Containers, not destinations. */
const EXCLUDED_SLUGS = new Set(["alla-produkter", "all-products"]);

const MAX_CHIPS = 5;

export function CategoryBrowse({
  categories,
  images = {},
}: {
  categories: CategoryItem[];
  /** category id -> background image, from `buildCategoryImageMap` */
  images?: Record<number, { src: string; kind: "editorial" | "product" }>;
}) {
  const t = useTranslation();

  const parents = categories
    .filter((c) => !c.parentId && !EXCLUDED_SLUGS.has(categorySlug(c)))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (parents.length === 0) return null;

  return (
    <section className="mb-14">
      {/* SectionHeading takes i18n keys, not resolved strings. */}
      <SectionHeading
        eyebrow="landing.browseEyebrow"
        title="landing.browseTitle"
        lead="landing.browseLead"
        linkLabel="landing.browseAll"
        linkHref="/products"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {parents.map((parent, i) => {
          const children = categories
            .filter((c) => c.parentId === parent.id)
            .sort((a, b) => a.name.localeCompare(b.name));
          const parentSlug = categorySlug(parent);
          const shown = children.slice(0, MAX_CHIPS);
          const rest = children.length - shown.length;
          const image = images[parent.id];

          return (
            <div
              key={parent.id}
              className="group/cat relative flex flex-col overflow-hidden border border-gray-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
            >
              {/* Headline block: the whole area is the primary link. */}
              <Link
                href={`/products?category=${parentSlug}`}
                className="relative flex min-h-[148px] items-end justify-between gap-4 overflow-hidden px-5 pb-5 pt-6 md:min-h-[168px] md:px-6"
                style={{ background: INK_GRADIENT }}
              >
                {/* An editorial photo (public/categories/<slug>.jpg) is a
                    photograph and wants the whole panel, under a scrim so the
                    name still wins. */}
                {image?.kind === "editorial" && (
                  <>
                    <span
                      className="pointer-events-none absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover/cat:scale-[1.06]"
                      style={{ backgroundImage: `url(${image.src})` }}
                      aria-hidden
                    />
                    <span
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(18,18,18,0.92) 0%, rgba(18,18,18,0.62) 45%, rgba(18,18,18,0.30) 100%)",
                      }}
                      aria-hidden
                    />
                  </>
                )}

                {/* A catalogue image is a cutout shot on white. `bg-cover`
                    fills the panel edge to edge — it crops the image, which is
                    the point: a big close-up of the part reads better than a
                    small complete one. `mix-blend-screen` drops the white
                    studio ground out against the charcoal. */}
                {image?.kind === "product" && (
                  <>
                    <span
                      className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-90 mix-blend-screen transition-transform duration-700 ease-out group-hover/cat:scale-[1.05]"
                      style={{ backgroundImage: `url(${image.src})` }}
                      aria-hidden
                    />
                    {/* Bottom-weighted scrim: the name sits at the bottom-left,
                        so that corner needs to stay dark. */}
                    <span
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(18,18,18,0.90) 0%, rgba(18,18,18,0.45) 55%, rgba(18,18,18,0.10) 100%)",
                      }}
                      aria-hidden
                    />
                  </>
                )}
                {/* Diagonal sheen that sweeps across on hover — echoes the
                    shimmer on the hero's CTA. */}
                <span
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/2 -translate-x-full skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover/cat:translate-x-[320%]"
                  aria-hidden
                />
                <div className="relative min-w-0">
                  <span
                    className="text-[10px] font-semibold tabular-nums"
                    style={{ color: BRAND.green }}
                    aria-hidden
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-1 truncate text-2xl font-black uppercase italic leading-none tracking-tight text-white md:text-3xl">
                    {parent.name}
                  </h3>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">
                    {children.length > 0
                      ? t(
                          parent.name.toLowerCase() === "turbo"
                            ? "landing.partCount"
                            : "landing.modelCount",
                          { count: children.length },
                        )
                      : t("landing.viewCategory")}
                  </p>
                </div>
                <ArrowUpRight
                  className="relative mt-1 size-5 shrink-0 text-white/40 transition-all duration-300 group-hover/cat:-translate-y-0.5 group-hover/cat:translate-x-0.5"
                  strokeWidth={2}
                  aria-hidden
                />
              </Link>

              {/* Subcategory chips — the level people actually search for. */}
              {shown.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-gray-200 px-5 py-4 md:px-6">
                  {shown.map((child) => (
                    <Link
                      key={child.id}
                      href={`/products?category=${categorySlug(child)}`}
                      className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 transition-all duration-200 hover:-translate-y-px hover:border-[#6ec900] hover:bg-[#6ec900] hover:text-white"
                    >
                      {child.name}
                    </Link>
                  ))}
                  {rest > 0 && (
                    <Link
                      href={`/products?category=${parentSlug}`}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-gray-400 transition-colors duration-200 hover:text-gray-900"
                    >
                      +{rest}
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
