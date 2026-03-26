"use client";

import { Menu, X, ChevronRight, User, LogOut, MapPin, LayoutGrid, Car, Gauge, Wrench, Box, CircleDot } from "lucide-react";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslation } from "@/i18n/context";
import { useLanguage } from "@/i18n/context";
import { categorySlug, cn } from "@/lib/utils";
import { useSession, signOut } from "next-auth/react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { fetchCategories } from "@/lib/api";
import gsap from "gsap";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

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

type MobileMenuProps = {
  onAuthClick?: () => void;
};

function MobileMenuContent({ onAuthClick }: MobileMenuProps) {
  const { locale } = useLanguage();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const t = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get("category");
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  // Fetch categories when menu opens or locale changes (do not cache across languages)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchCategories(locale)
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, locale]);

  // GSAP animations
  const animateOpen = useCallback(() => {
    if (!backdropRef.current || !panelRef.current) return;

    const tl = gsap.timeline();

    // Backdrop fade in
    tl.fromTo(
      backdropRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, ease: "power2.out" }
    );

    // Panel slide in
    tl.fromTo(
      panelRef.current,
      { x: "-100%" },
      { x: "0%", duration: 0.4, ease: "power3.out" },
      "-=0.2"
    );

    // Menu items stagger in
    if (menuItemsRef.current) {
      const items = menuItemsRef.current.querySelectorAll(".menu-item");
      tl.fromTo(
        items,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.3, stagger: 0.05, ease: "power2.out" },
        "-=0.2"
      );
    }

    // Footer slide up
    if (footerRef.current) {
      tl.fromTo(
        footerRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
        "-=0.3"
      );
    }
  }, []);

  const animateClose = useCallback((onComplete: () => void) => {
    if (!backdropRef.current || !panelRef.current) {
      onComplete();
      return;
    }

    setIsAnimating(true);
    const tl = gsap.timeline({ onComplete: () => {
      setIsAnimating(false);
      onComplete();
    }});

    // Panel slide out
    tl.to(panelRef.current, {
      x: "-100%",
      duration: 0.3,
      ease: "power3.in",
    });

    // Backdrop fade out
    tl.to(
      backdropRef.current,
      { opacity: 0, duration: 0.2, ease: "power2.in" },
      "-=0.15"
    );
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        animateOpen();
      });
    }
  }, [isOpen, animateOpen]);

  const handleClose = useCallback(() => {
    if (isAnimating) return;
    animateClose(() => {
      setIsOpen(false);
      setExpandedCategory(null);
    });
  }, [animateClose, isAnimating]);

  const makeHref = (slug: string) => {
    const params = new URLSearchParams();
    params.set("category", slug);
    return `${pathname}?${params.toString()}`;
  };

  const isSelected = (slug: string) =>
    (selectedCategory ?? "alla-produkter") === slug;

  const parentCategories = categories
    .filter((c) => {
      if (c.parentId) return false;
      const slug = categorySlug(c);
      return slug !== "alla-produkter" && slug !== "all-products";
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const getChildren = (parentId: number) =>
    categories.filter((c) => c.parentId === parentId);

  const handleLinkClick = () => {
    handleClose();
  };

  // Animate subcategory expansion
  const toggleCategory = (parentId: number) => {
    setExpandedCategory((prev) => (prev === parentId ? null : parentId));
  };

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="sm:hidden p-1"
        aria-label="Öppna meny"
      >
        <Menu className="w-5 h-5 text-gray-600" />
      </button>

      {/* Menu overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            ref={backdropRef}
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onClick={handleClose}
            style={{ opacity: 0 }}
          />

          {/* Menu panel */}
          <div
            ref={panelRef}
            className="fixed inset-y-0 left-0 z-50 w-[280px] bg-white shadow-2xl sm:hidden flex flex-col"
            style={{ transform: "translateX(-100%)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <Link href="/" onClick={handleLinkClick} className="flex items-center">
                <Image src="/logo.svg" alt="Turbomeck" width={28} height={28} />
                <span className="text-lg font-semibold tracking-wider italic ml-2">
                  <span className="text-[#6ec900]">TURBO</span>
                  <span className="text-gray-700">MECK</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Stäng meny"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Categories */}
            <div ref={menuItemsRef} className="flex-1 overflow-y-auto py-4">
              <p className="menu-item px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {t("products.categories")}
              </p>

              {/* All products */}
              <Link
                href={pathname}
                onClick={handleLinkClick}
                className={cn(
                  "menu-item flex items-center gap-3 mx-3 px-3 py-3 rounded-xl text-sm font-medium transition-all",
                  isSelected("alla-produkter")
                    ? "bg-[#6ec900]/10 text-[#6ec900]"
                    : "text-gray-600 hover:bg-gray-50 active:scale-[0.98]"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
                {t("products.allProducts")}
              </Link>

              {/* Parent categories */}
              {parentCategories.map((parent) => {
                const children = getChildren(parent.id);
                const parentSlug = categorySlug(parent);
                const hasChildren = children.length > 0;
                const isExpanded = expandedCategory === parent.id;
                const Icon = getCategoryIcon(parent.name);

                return (
                  <div key={parent.id} className="menu-item">
                    <div className="flex items-center mx-3">
                      <Link
                        href={makeHref(parentSlug)}
                        onClick={handleLinkClick}
                        className={cn(
                          "flex-1 flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all",
                          isSelected(parentSlug)
                            ? "bg-[#6ec900]/10 text-[#6ec900]"
                            : "text-gray-600 hover:bg-gray-50 active:scale-[0.98]"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {parent.name}
                      </Link>
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => toggleCategory(parent.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
                        >
                          <ChevronRight
                            className={cn(
                              "w-4 h-4 transition-transform duration-200",
                              isExpanded && "rotate-90"
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {/* Subcategories with animation */}
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-300 ease-out",
                        isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                      )}
                    >
                      <div className="ml-8 mr-3 mt-1 mb-2 space-y-1 border-l-2 border-gray-100 pl-3">
                        {children.map((child) => {
                          const childSlug = categorySlug(child);
                          return (
                            <Link
                              key={child.id}
                              href={makeHref(childSlug)}
                              onClick={handleLinkClick}
                              className={cn(
                                "block px-3 py-2.5 rounded-lg text-sm transition-all",
                                isSelected(childSlug)
                                  ? "bg-[#6ec900]/10 text-[#6ec900] font-medium"
                                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 active:scale-[0.98]"
                              )}
                            >
                              {child.name}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div
              ref={footerRef}
              className="border-t border-gray-100 p-4 space-y-1 bg-gray-50/50"
              style={{ opacity: 0 }}
            >
              {session ? (
                <>
                  <Link
                    href="/account"
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-white transition-all active:scale-[0.98]"
                  >
                    <User className="w-4 h-4" />
                    {t("nav.myAccount")}
                  </Link>
                  <Link
                    href="/account?section=address"
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-white transition-all active:scale-[0.98]"
                  >
                    <MapPin className="w-4 h-4" />
                    {t("nav.deliveryAddress")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      handleLinkClick();
                      signOut({ callbackUrl: "/" });
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-white transition-all active:scale-[0.98]"
                  >
                    <LogOut className="w-4 h-4" />
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleLinkClick();
                    onAuthClick?.();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-white transition-all active:scale-[0.98]"
                >
                  <User className="w-4 h-4" />
                  {t("nav.login")}
                </button>
              )}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-sm text-gray-500">{t("nav.language")}:</span>
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function MobileMenu({ onAuthClick }: MobileMenuProps) {
  return (
    <Suspense fallback={<Menu className="w-5 h-5 text-gray-600 sm:hidden" />}>
      <MobileMenuContent onAuthClick={onAuthClick} />
    </Suspense>
  );
}
