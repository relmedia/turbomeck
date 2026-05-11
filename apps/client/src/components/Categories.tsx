"use client";

import * as React from "react";
import { LayoutGrid, Car, Gauge, Wrench, CircleDot } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@repo/ui/components/navigation-menu";
import { categorySlug, cn } from "@/lib/utils";

// Segmented-control item style — pills that sit on a muted bar.
// Default: transparent + muted text; hover: subtle lift to background/70;
// active or open dropdown: solid background, foreground text, soft shadow.
const barItemStyle = cn(
  "group inline-flex h-9 w-max items-center justify-center gap-2 rounded-md px-3.5 py-2",
  "text-sm font-medium text-muted-foreground transition-all",
  "hover:bg-background/70 hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  "data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm",
  "data-[state=open]:bg-background data-[state=open]:text-foreground data-[state=open]:shadow-sm",
  "disabled:pointer-events-none disabled:opacity-50",
);

// Inline navbar item style — classic top-nav text links, no segmented chrome.
// Sits flush in the navbar so it shares the navbar's background.
const inlineItemStyle = cn(
  "group inline-flex h-9 w-max items-center justify-center gap-1.5 rounded-md px-3 py-2",
  "text-sm font-medium text-foreground/80 transition-colors",
  "hover:bg-accent hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  "data-[active]:text-foreground data-[active]:font-semibold",
  "data-[state=open]:bg-accent data-[state=open]:text-foreground",
  "disabled:pointer-events-none disabled:opacity-50",
);

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

type CategoriesVariant = "bar" | "inline";

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("saab") || lower.includes("volvo") || lower.includes("bil")) {
    return Car;
  }
  if (lower.includes("turbo") || lower.includes("kompressor")) {
    return Gauge;
  }
  if (lower.includes("verktyg") || lower.includes("tool")) {
    return Wrench;
  }
  return CircleDot;
}

const Categories = ({
  categories,
  variant = "bar",
}: {
  categories: CategoryItem[];
  variant?: CategoriesVariant;
}) => {
  const t = useTranslation();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get("category");
  const isInline = variant === "inline";
  const navItemStyle = isInline ? inlineItemStyle : barItemStyle;

  const makeHref = (slug: string) => {
    const params = new URLSearchParams();
    params.set("category", slug);
    return `/products?${params.toString()}`;
  };

  const isSelected = (slug: string) =>
    (selectedCategory ?? "alla-produkter") === slug;

  const apiParentCategories = categories
    .filter((c) => {
      if (c.parentId) return false;
      const slug = categorySlug(c);
      return slug !== "alla-produkter" && slug !== "all-products";
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const getChildren = (parentId: number) =>
    categories.filter((c) => c.parentId === parentId);

  return (
    <NavigationMenu
      viewport={false}
      className={cn(
        isInline
          ? "hidden lg:flex max-w-none justify-start"
          : cn(
              "hidden sm:flex max-w-none w-full justify-start",
              "rounded-md border border-border/40 bg-muted/40 p-1.5",
              "supports-backdrop-filter:bg-muted/30 supports-backdrop-filter:backdrop-blur-sm",
            ),
      )}
    >
      <NavigationMenuList
        className={cn(
          "justify-start gap-1",
          isInline ? "flex-nowrap" : "flex-wrap",
        )}
      >
        {/* Alla produkter — always first */}
        <NavigationMenuItem>
          <NavigationMenuLink
            asChild
            active={isSelected("alla-produkter")}
            className={navItemStyle}
          >
            <Link href="/products">
              <LayoutGrid className="w-4 h-4 shrink-0" />
              {t("products.allProducts")}
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>

        {/* Parent categories — dropdown if they have children, plain link otherwise */}
        {apiParentCategories.map((parent) => {
          const children = getChildren(parent.id);
          const parentSlug = categorySlug(parent);
          const hasChildren = children.length > 0;
          const Icon = getCategoryIcon(parent.name);
          const parentActive = isSelected(parentSlug);

          if (hasChildren) {
            const childActive = children.some((c) =>
              isSelected(categorySlug(c)),
            );
            return (
              <NavigationMenuItem key={parent.id}>
                <NavigationMenuTrigger
                  data-active={parentActive || childActive ? "" : undefined}
                  className={navItemStyle}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {parent.name}
                </NavigationMenuTrigger>
                <NavigationMenuContent
                  className={cn(
                    // When viewport={false}, content renders inline below its
                    // own trigger — it needs popover styling that the shared
                    // viewport would normally provide.
                    "top-full mt-2 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg",
                    "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out",
                    "data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out",
                  )}
                >
                  <ul className="grid w-[260px] gap-1 p-2">
                    <li>
                      <NavigationMenuLink
                        asChild
                        active={parentActive}
                        className={cn(
                          "flex select-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium leading-none outline-none transition-colors",
                          "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                          "data-active:bg-accent/50",
                        )}
                      >
                        <Link href={makeHref(parentSlug)}>
                          <Icon className="w-4 h-4 shrink-0 opacity-70" />
                          {t("products.viewAllIn", { name: parent.name })}
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li
                      aria-hidden
                      className="mx-1 my-1 h-px bg-border/70"
                    />
                    {children.map((child) => {
                      const childSlug = categorySlug(child);
                      return (
                        <li key={child.id}>
                          <NavigationMenuLink
                            asChild
                            active={isSelected(childSlug)}
                            className={cn(
                              "flex select-none items-center rounded-md px-3 py-2 text-sm leading-none outline-none transition-colors",
                              "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                              "focus:bg-accent focus:text-accent-foreground",
                              "data-active:bg-accent/60 data-active:text-foreground data-active:font-medium",
                            )}
                          >
                            <Link href={makeHref(childSlug)}>
                              {child.name}
                            </Link>
                          </NavigationMenuLink>
                        </li>
                      );
                    })}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          }

          return (
            <NavigationMenuItem key={parent.id}>
              <NavigationMenuLink
                asChild
                active={parentActive}
                className={navItemStyle}
              >
                <Link href={makeHref(parentSlug)}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {parent.name}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
};

export default Categories;
