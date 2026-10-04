"use client";

import { useRef } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { cn, categorySlug } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import RichTextContent from "./RichTextContent";
import { useProductReviews } from "./ProductReviews";
import { ProductReviewsPanel } from "./ProductReviewsPanel";
import type { ProductType } from "@/types";

/** Anchor used by the "read more" link under the clamped description above. */
export const PRODUCT_TABS_SECTION_ID = "produktinformation";

export type ProductTabId = "description" | "specifications" | "reviews";

type Category = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

type Props = {
  product: ProductType;
  categories: Category[];
  activeTab: ProductTabId;
  onTabChange: (tab: ProductTabId) => void;
};

const TAB_ORDER: ProductTabId[] = ["description", "specifications", "reviews"];

export function ProductInfoTabs({
  product,
  categories,
  activeTab,
  onTabChange,
}: Props) {
  const t = useTranslation();
  const { data } = useProductReviews();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const tabs: { id: ProductTabId; label: string; count?: number }[] = [
    { id: "description", label: t("product.tabDescription") },
    { id: "specifications", label: t("product.tabSpecifications") },
    { id: "reviews", label: t("reviews.title"), count: data?.totalCount ?? 0 },
  ];

  // Roving focus: arrow keys move between tabs, Home/End jump to the ends.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const current = TAB_ORDER.indexOf(activeTab);
    let next = -1;
    if (e.key === "ArrowRight") next = (current + 1) % TAB_ORDER.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TAB_ORDER.length - 1;
    if (next === -1) return;
    e.preventDefault();
    const id = TAB_ORDER[next]!;
    onTabChange(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <section id={PRODUCT_TABS_SECTION_ID} className="mt-12 scroll-mt-24">
      <div className="border-b">
        <div
          role="tablist"
          aria-label={t("product.tabsLabel")}
          onKeyDown={handleKeyDown}
          className="-mb-px flex gap-8 overflow-x-auto overflow-y-hidden"
        >
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                id={`product-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`product-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-2 text-sm font-medium tracking-tight transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "border-[#6ec900] text-foreground"
                    : "border-transparent text-gray-500 hover:border-gray-200 hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs tabular-nums",
                      selected
                        ? "bg-[#6ec900]/15 text-foreground"
                        : "bg-muted text-gray-500"
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`product-panel-${activeTab}`}
        aria-labelledby={`product-tab-${activeTab}`}
        tabIndex={0}
        className="pt-8 focus-visible:outline-none"
      >
        {activeTab === "description" && <DescriptionPanel product={product} />}
        {activeTab === "specifications" && (
          <SpecificationsPanel product={product} categories={categories} />
        )}
        {activeTab === "reviews" && (
          <ProductReviewsPanel productId={Number(product.id)} />
        )}
      </div>
    </section>
  );
}

function DescriptionPanel({ product }: { product: ProductType }) {
  const t = useTranslation();
  const hasDescription = !!product.description && product.description.trim() !== "";

  if (!hasDescription) {
    return <p className="text-sm text-gray-500">{t("product.noDescription")}</p>;
  }

  return (
    <div className="max-w-3xl text-[15px] leading-relaxed">
      <RichTextContent html={product.description} />
    </div>
  );
}

type SpecRow = { label: string; value: React.ReactNode };
type SpecGroup = { title: string; rows: SpecRow[] };

/**
 * Technical data entered per product in admin (`specifications`), kept in the order
 * it was entered and split into the groups the shop typed — Kompressor, Turbin,
 * Anslutningar and so on, the way turbo retailers lay out a spec sheet. Rows saved
 * without a group fall into the generic one together with the catalogue data.
 */
function buildSpecGroups(
  product: ProductType,
  categories: Category[],
  t: (key: string) => string
): SpecGroup[] {
  const groups: SpecGroup[] = [];
  const groupFor = (title: string) => {
    const existing = groups.find((g) => g.title === title);
    if (existing) return existing;
    const created: SpecGroup = { title, rows: [] };
    groups.push(created);
    return created;
  };

  const generalTitle = t("product.specGroupGeneral");

  for (const spec of product.specifications ?? []) {
    if (!spec?.label || !spec?.value) continue;
    groupFor(spec.group?.trim() || generalTitle).rows.push({
      label: spec.label,
      value: spec.value,
    });
  }

  const productCategories = (product.categoryIds ?? [])
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c);
  const attributes = (product.attributes ?? []).filter(
    (a) => a.options && a.options.length > 0
  );

  const general = groupFor(generalTitle);
  general.rows.push({ label: t("product.specArticleNumber"), value: String(product.id) });
  if (productCategories.length > 0) {
    general.rows.push({
      label: t("product.specCategory"),
      value: (
        <div className="flex flex-wrap justify-end gap-1.5">
          {productCategories.map((c) => (
            <Link
              key={c.id}
              href={`/products?category=${categorySlug(c)}`}
              className="rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors hover:border-gray-400 hover:text-foreground"
            >
              {c.parentName ? `${c.parentName} › ${c.name}` : c.name}
            </Link>
          ))}
        </div>
      ),
    });
  }
  for (const attribute of attributes) {
    general.rows.push({ label: attribute.name, value: attribute.options.join(", ") });
  }
  if (product.isExchangeTurbo) {
    general.rows.push({ label: t("product.specExchangeTurbo"), value: t("common.yes") });
  }

  return groups.filter((g) => g.rows.length > 0);
}

function SpecificationsPanel({
  product,
  categories,
}: {
  product: ProductType;
  categories: Category[];
}) {
  const t = useTranslation();
  const groups = buildSpecGroups(product, categories, t);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        {groups.map((group, groupIndex) => (
          <section key={group.title}>
            <h3
              className={cn(
                "border-b bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400",
                groupIndex > 0 && "border-t"
              )}
            >
              {group.title}
            </h3>
            <dl className="divide-y">
              {group.rows.map((row) => (
                <div
                  key={`${group.title}-${row.label}`}
                  className="flex items-start justify-between gap-6 px-4 py-3 odd:bg-muted/10"
                >
                  <dt className="text-sm text-gray-500">{row.label}</dt>
                  <dd className="text-right text-sm font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {product.isExchangeTurbo && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {t("product.exchangeTurboNote")}
          </p>
        </div>
      )}
    </div>
  );
}

