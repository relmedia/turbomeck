"use client";

import { Button } from "@/components/ui/button";
import { Star, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const RATINGS = [
  { stars: 5, count: 4000, color: "bg-emerald-500" },
  { stars: 4, count: 2100, color: "bg-emerald-400" },
  { stars: 3, count: 800, color: "bg-amber-400" },
  { stars: 2, count: 631, color: "bg-amber-500" },
  { stars: 1, count: 344, color: "bg-red-500" },
];

const totalReviews = RATINGS.reduce((sum, r) => sum + r.count, 0);
const maxCount = Math.max(...RATINGS.map((r) => r.count));
const avgRating =
  RATINGS.reduce((sum, r) => sum + r.stars * r.count, 0) / totalReviews;

export function CustomerReviews() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Kundrecensioner</h1>
          <p className="text-sm text-muted-foreground">
            Baserat på {totalReviews.toLocaleString("sv-SE")} verifierade köp
          </p>
        </div>
        <Button variant="outline" size="sm">
          Visa alla
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-4 gap-y-6">
        <div className="flex flex-col items-center gap-1">
          <div className="flex text-amber-500">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={cn(
                  "h-5 w-5",
                  s <= Math.round(avgRating) ? "fill-current" : "fill-amber-200"
                )}
              />
            ))}
          </div>
          <span className="text-2xl font-bold">{avgRating.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">av 5</span>
        </div>

        <div className="space-y-2">
          {RATINGS.map((r) => (
            <div key={r.stars} className="flex items-center gap-2">
              <span className="w-8 text-sm text-muted-foreground">
                {r.stars}★
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", r.color)}
                  style={{ width: `${(r.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-12 text-right text-sm tabular-nums">
                {r.count.toLocaleString("sv-SE")}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex text-amber-500">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} className="h-4 w-4 fill-current" />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">12 mars 2025</span>
        </div>
        <p className="font-medium text-sm">Överträffade mina förväntningar!</p>
        <p className="text-sm text-muted-foreground">
          Jag var tveksam först, men denna produkt har helt förändrat min
          vardag. Kvaliteten är enastående och den är så lätt att använda.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Sarah J.</span>
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            Verifierat köp
          </span>
        </div>
      </div>
    </div>
  );
}
