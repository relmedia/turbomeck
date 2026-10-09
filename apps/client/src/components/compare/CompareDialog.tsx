"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ShoppingCart, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { useCurrency } from "@/components/providers/CurrencyProvider";
import { useTranslation } from "@/i18n/context";
import { fetchProductsByIds } from "@/lib/api";
import { useLanguage } from "@/i18n/context";
import { productUrl, cn } from "@/lib/utils";
import {
  bestPriceIndex,
  buildCompareGroups,
  onlyDifferences,
  type CompareGroup,
} from "@/lib/compare-rows";
import useCompareStore from "@/stores/compareStore";
import type { ProductType } from "@/types";

/**
 * Side-by-side product comparison.
 *
 * Everything shown here is fetched fresh when the dialog opens, never read from
 * the persisted list — see `stores/compareStore.ts` for why. That also means a
 * price or stock level that moved since the customer added the product is
 * correct here, which matters because this table is what they decide on.
 *
 * Layout: the label column is sticky so a spec name stays visible while the
 * product columns scroll sideways. That is the one interaction a comparison
 * table lives or dies by on a phone — without it you scroll to the fourth
 * column and no longer know which row you are reading.
 */

const EM_DASH = "—";

export function CompareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const { locale } = useLanguage();
  const { price } = useCurrency();
  const ids = useCompareStore((s) => s.ids);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);

  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [differencesOnly, setDifferencesOnly] = useState(false);

  useEffect(() => {
    if (!open || ids.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchProductsByIds(ids, locale as "sv" | "en")
      .then((list) => {
        if (cancelled) return;
        // Keep the customer's chosen order, not the API's. A column that jumps
        // between openings makes the table impossible to re-read.
        const byId = new Map(list.map((p) => [Number(p.id), p]));
        setProducts(ids.map((id) => byId.get(id)).filter((p): p is ProductType => !!p));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ids, locale]);

  const labels = useMemo(
    () => ({
      general: t("product.specGroupGeneral"),
      price: t("compare.rowPrice"),
      availability: t("compare.rowAvailability"),
      inStock: t("compare.inStock"),
      outOfStock: t("compare.outOfStock"),
      weight: t("compare.rowWeight"),
      exchangeTurbo: t("product.specExchangeTurbo"),
      articleNumber: t("product.specArticleNumber"),
      yes: t("common.yes"),
      no: t("common.no"),
    }),
    [t],
  );

  const allGroups = useMemo<CompareGroup[]>(
    () => buildCompareGroups(products, labels, price),
    [products, labels, price],
  );
  const groups = differencesOnly ? onlyDifferences(allGroups) : allGroups;
  const cheapest = bestPriceIndex(products);
  const differenceCount = useMemo(
    () => allGroups.reduce((n, g) => n + g.rows.filter((r) => r.differs).length, 0),
    [allGroups],
  );

  // Fixed column widths: the sticky label column needs a known offset, and
  // percentage widths collapse once a spec value wraps.
  const columnWidth = "min-w-[180px] w-[180px] sm:min-w-[220px] sm:w-[220px]";
  const labelWidth = "min-w-[132px] w-[132px] sm:min-w-[180px] sm:w-[180px]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1200px)] max-h-[90vh] gap-0 overflow-hidden p-0">
        <div className="flex items-start justify-between gap-4 border-b py-4 pl-5 pr-14">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-semibold">
              {t("compare.dialogTitle")}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              {products.length > 0
                ? t("compare.dialogSubtitle", {
                    count: products.length,
                    differences: differenceCount,
                  })
                : t("compare.dialogEmpty")}
            </DialogDescription>
          </div>
          {products.length > 1 && differenceCount > 0 && (
            <Button
              variant={differencesOnly ? "default" : "outline"}
              size="sm"
              className="shrink-0 cursor-pointer"
              onClick={() => setDifferencesOnly((v) => !v)}
              aria-pressed={differencesOnly}
            >
              {t("compare.onlyDifferences")}
            </Button>
          )}
        </div>

        {loading && products.length === 0 ? (
          <div className="flex items-center justify-center gap-3 px-5 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            {t("compare.loading")}
          </div>
        ) : failed ? (
          <div className="px-5 py-16 text-center text-muted-foreground">
            {t("compare.loadFailed")}
          </div>
        ) : products.length === 0 ? (
          <div className="px-5 py-16 text-center text-muted-foreground">
            {t("compare.dialogEmpty")}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t("compare.tableCaption")}</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className={cn(
                      "sticky left-0 top-0 z-30 bg-background p-3 text-left align-bottom",
                      labelWidth,
                    )}
                  >
                    <span className="sr-only">{t("compare.columnLabels")}</span>
                  </th>
                  {products.map((product, i) => (
                    <th
                      key={product.id}
                      scope="col"
                      className={cn(
                        "sticky top-0 z-20 border-l bg-background p-3 text-left align-top",
                        columnWidth,
                      )}
                    >
                      <div className="relative flex flex-col gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 z-10 size-7 shrink-0 cursor-pointer text-muted-foreground"
                          onClick={() => remove(Number(product.id))}
                          aria-label={t("compare.removeNamed", { name: product.name })}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                        <Link
                          href={productUrl(product)}
                          onClick={() => onOpenChange(false)}
                          className="relative block size-20 shrink-0 overflow-hidden border bg-white"
                        >
                          <ImageWithFallback
                            src={product.images?.default || product.galleryImages?.[0] || "/logo.svg"}
                            alt={product.name}
                            fill
                            sizes="80px"
                            className="object-contain p-1"
                          />
                        </Link>
                        <Link
                          href={productUrl(product)}
                          onClick={() => onOpenChange(false)}
                          className="line-clamp-2 text-sm font-medium leading-snug hover:underline"
                        >
                          {product.name}
                        </Link>
                        {i === cheapest && (
                          <Badge className="w-fit text-[10px] font-semibold uppercase tracking-wide">
                            {t("compare.lowestPrice")}
                          </Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {groups.map((group) => (
                <tbody key={group.title}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={products.length + 1}
                      className="sticky left-0 bg-muted/60 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      {group.title}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={`${group.title}-${row.label}`} className="border-t">
                      <th
                        scope="row"
                        className={cn(
                          "sticky left-0 z-10 bg-background p-3 text-left align-top font-medium text-muted-foreground",
                          labelWidth,
                        )}
                      >
                        {row.label}
                      </th>
                      {row.values.map((value, i) => (
                        <td
                          key={`${products[i]?.id ?? i}`}
                          className={cn(
                            "border-l p-3 align-top tabular-nums",
                            // Differences are what the customer came for, so
                            // they are the thing that gets the emphasis.
                            row.differs ? "font-medium text-foreground" : "text-muted-foreground",
                            value === null && "text-muted-foreground/60",
                          )}
                        >
                          {value ?? EM_DASH}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}

              <tfoot>
                <tr className="border-t">
                  <td className={cn("sticky left-0 z-10 bg-background p-3", labelWidth)} />
                  {products.map((product) => (
                    <td key={product.id} className={cn("border-l p-3 align-top", columnWidth)}>
                      <Link href={productUrl(product)} onClick={() => onOpenChange(false)}>
                        <Button size="sm" className="w-full cursor-pointer">
                          <ShoppingCart className="size-4" aria-hidden />
                          {t("compare.viewProduct")}
                        </Button>
                      </Link>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-muted-foreground"
            onClick={() => {
              clear();
              onOpenChange(false);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            {t("compare.clearAll")}
          </Button>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            {t("compare.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
