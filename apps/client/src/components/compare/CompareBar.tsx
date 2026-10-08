"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, X } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { useLanguage, useTranslation } from "@/i18n/context";
import { fetchProductsByIds } from "@/lib/api";
import useCompareStore, { MAX_COMPARE_ITEMS } from "@/stores/compareStore";
import { CompareDialog } from "./CompareDialog";
import type { ProductType } from "@/types";

/**
 * The comparison tray: a docked bar showing what is queued up, with the button
 * that opens the table.
 *
 * Mounted once in the root layout so a selection survives navigation — the
 * whole point is to pick one product here, another two pages later, and still
 * have both. It renders nothing at all when the list is empty, so it costs an
 * empty element on every other page.
 *
 * Thumbnails come from the catalogue, not from storage, for the reason set out
 * in `stores/compareStore.ts`: a persisted image URL is attacker-controlled by
 * the time it comes back, and this one is handed to an <Image>. The fetch runs
 * once per page load rather than per navigation, because the layout (and so
 * this component's state) survives client-side route changes.
 */
export function CompareBar() {
  const t = useTranslation();
  const { locale } = useLanguage();
  const ids = useCompareStore((s) => s.ids);
  const hasHydrated = useCompareStore((s) => s.hasHydrated);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);

  const [items, setItems] = useState<ProductType[]>([]);
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    fetchProductsByIds(ids, locale as "sv" | "en")
      .then((list) => {
        if (cancelled) return;
        const byId = new Map(list.map((p) => [Number(p.id), p]));
        setItems(ids.map((id) => byId.get(id)).filter((p): p is ProductType => !!p));
      })
      .catch(() => {
        // A failed lookup must not strand the customer with a bar they cannot
        // clear, so the chips fall back to plain slots below.
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ids, locale]);

  // Storage not read yet: render nothing rather than letting an empty bar pop
  // in on hydration. Beyond that the tray stays mounted so AnimatePresence can
  // animate it OUT as well as in.
  if (!hasHydrated) return null;

  const visible = ids.length > 0;
  const spacerTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: "easeOut" as const };

  return (
    <>
      <AnimatePresence>
        {visible && (
      <motion.div
        key="compare-tray"
        // Slides up from under the fold instead of appearing instantly. The
        // spring is deliberately barely-bouncy: this is a utility bar that
        // appears mid-browse, and a lively overshoot pulls attention away
        // from the product the customer was looking at.
        initial={reduceMotion ? false : { y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
        transition={
          reduceMotion
            ? { duration: 0.15 }
            : { type: "spring", stiffness: 420, damping: 38, mass: 0.9 }
        }
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur supports-backdrop-filter:bg-background/80"
        role="region"
        aria-label={t("compare.trayLabel")}
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
          <ArrowLeftRight className="hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden />

          <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {ids.map((id) => {
              const product = items.find((p) => Number(p.id) === id);
              return (
                <li key={id} className="relative shrink-0">
                  <div className="size-12 overflow-hidden border bg-white sm:size-14">
                    {product ? (
                      <div className="relative size-full">
                        <ImageWithFallback
                          src={
                            product.images?.default ||
                            product.galleryImages?.[0] ||
                            "/logo.svg"
                          }
                          alt={product.name}
                          fill
                          sizes="56px"
                          className="object-contain p-1"
                        />
                      </div>
                    ) : (
                      <div className="size-full animate-pulse bg-muted" aria-hidden />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    aria-label={
                      product
                        ? t("compare.removeNamed", { name: product.name })
                        : t("compare.remove")
                    }
                    className="absolute -right-1.5 -top-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              );
            })}

            {/* Empty slots, so the four-column limit is visible rather than
                something you discover by being refused. */}
            {Array.from({ length: MAX_COMPARE_ITEMS - ids.length }).map((_, i) => (
              <li
                key={`slot-${i}`}
                aria-hidden
                className="hidden size-12 shrink-0 border border-dashed border-gray-300 sm:block sm:size-14"
              />
            ))}
          </ul>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              className="hidden cursor-pointer text-muted-foreground sm:inline-flex"
            >
              {t("compare.clearAll")}
            </Button>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              disabled={ids.length < 2}
              className="cursor-pointer"
            >
              {ids.length < 2
                ? t("compare.addOneMore")
                : t("compare.openWithCount", { count: ids.length })}
            </Button>
          </div>
        </div>
      </motion.div>
        )}
      </AnimatePresence>

      {/* Keeps the footer clear of the docked bar. Animated in step with the
          tray so the page does not jump by 72px the instant a product is
          selected. */}
      <motion.div
        aria-hidden
        initial={false}
        animate={{ height: visible ? 72 : 0 }}
        transition={spacerTransition}
        className="sm:hidden"
      />
      <motion.div
        aria-hidden
        initial={false}
        animate={{ height: visible ? 80 : 0 }}
        transition={spacerTransition}
        className="hidden sm:block"
      />

      <CompareDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
