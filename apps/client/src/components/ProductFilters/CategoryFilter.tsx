"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Minus, Plus } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { categorySlug, cn } from "@/lib/utils";
import { useProductFilters } from "./useProductFilters";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

/**
 * Two-level category tree. Single-select (radio semantics) because a
 * product can only be filtered by one category at a time in this UI —
 * keeps the URL state simple and matches the existing `?category=` contract.
 *
 * Expansion of subcategory rows is independent of selection:
 *   - Default (auto): a parent is expanded when it OR one of its children is
 *     the active filter.
 *   - The user can override that by clicking the +/− indicator on the right
 *     of a parent row — the indicator collapses/expands without changing
 *     the filter selection.
 */
export function CategoryFilter({
  categories,
}: {
  categories: CategoryItem[];
}) {
  const t = useTranslation();
  const { state, update } = useProductFilters();

  const selected = state.category ?? "alla-produkter";

  const tree = useMemo(() => {
    const parents = categories
      .filter((c) => {
        if (c.parentId) return false;
        const slug = categorySlug(c);
        return slug !== "alla-produkter" && slug !== "all-products";
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return parents.map((parent) => ({
      ...parent,
      slug: categorySlug(parent),
      children: categories
        .filter((c) => c.parentId === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ ...c, slug: categorySlug(c) })),
    }));
  }, [categories]);

  // Manual overrides: maps parent id → desired expanded state. Absent entries
  // fall through to the auto-expanded value derived from selection.
  const [override, setOverride] = useState<Map<number, boolean>>(new Map());

  const handleSelect = (slug: string, parentId?: number) => {
    if (parentId != null) {
      // Selecting a parent or one of its children should reveal the children;
      // drop any manual collapse override so auto-expand wins.
      setOverride((prev) => {
        if (!prev.has(parentId)) return prev;
        const next = new Map(prev);
        next.delete(parentId);
        return next;
      });
    }
    update({ category: slug === "alla-produkter" ? null : slug });
  };

  const toggleExpansion = (parentId: number, autoExpanded: boolean) => {
    setOverride((prev) => {
      const next = new Map(prev);
      const currentlyExpanded = next.has(parentId)
        ? next.get(parentId)!
        : autoExpanded;
      const desired = !currentlyExpanded;
      if (desired === autoExpanded) {
        next.delete(parentId);
      } else {
        next.set(parentId, desired);
      }
      return next;
    });
  };

  return (
    <ul className="flex flex-col gap-0.5" role="radiogroup">
      <li>
        <CategoryRow
          label={t("products.allProducts")}
          icon={<LayoutGrid className="h-4 w-4 shrink-0" />}
          active={selected === "alla-produkter"}
          onClick={() => handleSelect("alla-produkter")}
        />
      </li>
      {tree.map((parent) => {
        const childActive = parent.children.some((c) => c.slug === selected);
        const autoExpanded = parent.slug === selected || childActive;
        const hasChildren = parent.children.length > 0;
        const expanded = override.has(parent.id)
          ? override.get(parent.id)!
          : autoExpanded;
        return (
          <li key={parent.id}>
            <CategoryRow
              label={parent.name}
              active={parent.slug === selected}
              onClick={() => handleSelect(parent.slug, parent.id)}
              indicator={
                hasChildren ? (expanded ? "expanded" : "collapsed") : "none"
              }
              onToggleIndicator={
                hasChildren
                  ? () => toggleExpansion(parent.id, autoExpanded)
                  : undefined
              }
              expansionLabel={
                hasChildren
                  ? expanded
                    ? t("products.filterCollapse", { name: parent.name })
                    : t("products.filterExpand", { name: parent.name })
                  : undefined
              }
            />
            {expanded && hasChildren && (
              <ul className="mt-0.5 ml-3 border-l border-border/60 pl-2">
                {parent.children.map((child) => (
                  <li key={child.id}>
                    <CategoryRow
                      label={child.name}
                      active={child.slug === selected}
                      onClick={() => handleSelect(child.slug, parent.id)}
                      compact
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CategoryRow({
  label,
  icon,
  active,
  onClick,
  compact = false,
  indicator = "none",
  onToggleIndicator,
  expansionLabel,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  /**
   * Visual affordance shown on the right of the row.
   * - "collapsed": parent has children, not expanded → show "+"
   * - "expanded":  parent has children and is showing them → show "−"
   * - "none":      leaf row or All-products row → nothing
   */
  indicator?: "collapsed" | "expanded" | "none";
  /** When provided, the +/− becomes a separate clickable button. */
  onToggleIndicator?: () => void;
  /** Accessible label for the +/− button. */
  expansionLabel?: string;
}) {
  return (
    <div
      className={cn(
        "group/row flex w-full items-center rounded-md text-sm transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={onClick}
        className={cn(
          "flex flex-1 items-center gap-2 text-left rounded-md cursor-pointer min-w-0",
          compact ? "px-2 py-1.5" : "px-2.5 py-2",
          active && "font-medium",
        )}
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
      </button>
      {indicator !== "none" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleIndicator?.();
          }}
          aria-label={expansionLabel}
          aria-expanded={indicator === "expanded"}
          className={cn(
            "shrink-0 inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors",
            "h-7 w-7 mr-1",
            active
              ? "text-foreground/80 hover:bg-background/60"
              : "text-muted-foreground/70 hover:bg-background/60 hover:text-foreground",
          )}
        >
          {indicator === "expanded" ? (
            <Minus className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
