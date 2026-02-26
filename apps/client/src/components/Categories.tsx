"use client";

import { Tag, ChevronDown, CarFront } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { categorySlug, cn } from "@/lib/utils";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

const Categories = ({ categories }: { categories: CategoryItem[] }) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const selectedCategory = searchParams.get("category");

  const makeHref = (slug: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("category", slug);
    return `${pathname}?${params.toString()}`;
  };

  const isSelected = (slug: string) =>
    (selectedCategory ?? "alla-produkter") === slug;

  const parentCategories = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => {
      const aSlug = categorySlug(a);
      const bSlug = categorySlug(b);
      if (aSlug === "alla-produkter") return -1;
      if (bSlug === "alla-produkter") return 1;
      return 0;
    });
  const getChildren = (parentId: number) =>
    categories.filter((c) => c.parentId === parentId);

  const triggerClass = cn(
    "flex items-center gap-2 h-9 px-4 py-2 rounded-md text-sm font-medium transition-colors",
    "hover:bg-white/50 hover:text-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
  );

  return (
    <div className="bg-gray-100 p-2 rounded-lg mb-4 text-sm flex flex-wrap items-center gap-1">
      {/* Main categories - with dropdown if they have subcategories */}
      {parentCategories.map((parent) => {
        const children = getChildren(parent.id);
        const parentSlug = categorySlug(parent);
        const hasChildren = children.length > 0;

        const linkContent = (
          <>
            {parent.name.toLowerCase().startsWith("saab") ? (
              <CarFront className="w-4 h-4 shrink-0" />
            ) : parent.name.toLowerCase().startsWith("volvo") ? (
              <CarFront className="w-4 h-4 shrink-0" />
            ) : (
              <Tag className="w-4 h-4 shrink-0" />
            )}
            {parent.name}
            {hasChildren && <ChevronDown className="w-4 h-4 ml-0.5 opacity-70" />}
          </>
        );

        const link = (
          <Link
            href={makeHref(parentSlug)}
            className={cn(
              triggerClass,
              isSelected(parentSlug) ? "bg-white" : "text-gray-500"
            )}
          >
            {linkContent}
          </Link>
        );

        if (hasChildren) {
          return (
            <HoverCard key={parent.id} openDelay={100} closeDelay={50}>
              <HoverCardTrigger asChild>{link}</HoverCardTrigger>
              <HoverCardContent align="start" className="min-w-[180px] p-2">
                <div className="flex flex-col gap-0.5">
                  {children.map((child) => {
                    const childSlug = categorySlug(child);
                    return (
                      <Link
                        key={child.id}
                        href={makeHref(childSlug)}
                        className="flex items-center rounded-sm px-2 py-1.5 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              </HoverCardContent>
            </HoverCard>
          );
        }

        return <span key={parent.id}>{link}</span>;
      })}
    </div>
  );
};

export default Categories;
