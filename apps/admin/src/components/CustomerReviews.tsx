"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import { Star, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type RatingBar = { stars: number; count: number; color: string };
type LatestReview = {
  userName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  orderId: number | null;
};

const DEFAULT_RATINGS: RatingBar[] = [
  { stars: 5, count: 0, color: "bg-emerald-500" },
  { stars: 4, count: 0, color: "bg-emerald-400" },
  { stars: 3, count: 0, color: "bg-amber-400" },
  { stars: 2, count: 0, color: "bg-amber-500" },
  { stars: 1, count: 0, color: "bg-red-500" },
];

export function CustomerReviews() {
  const [stats, setStats] = useState<{
    total: number;
    avg: number;
    byRating: RatingBar[];
    latestReview: LatestReview | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/reviews/stats")
      .then((r) => r.json())
      .then((data) => {
        setStats({
          total: data.total ?? 0,
          avg: data.avg ?? 0,
          byRating: data.byRating ?? DEFAULT_RATINGS,
          latestReview: data.latestReview ?? null,
        });
      })
      .catch(() => setStats({
        total: 0,
        avg: 0,
        byRating: DEFAULT_RATINGS,
        latestReview: null,
      }));
  }, []);

  const totalReviews = stats?.total ?? 0;
  const avgRating = totalReviews > 0 ? (stats?.avg ?? 0) : 0;
  const ratings = stats?.byRating ?? DEFAULT_RATINGS;
  const maxCount = Math.max(1, ...ratings.map((r) => r.count));
  const latest = stats?.latestReview;

  if (stats === null) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">Kundrecensioner</h1>
            <p className="text-sm text-muted-foreground">Laddar...</p>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Kundrecensioner</h1>
          <p className="text-sm text-muted-foreground">
            {totalReviews === 0
              ? "Inga recensioner ännu"
              : `Baserat på ${totalReviews.toLocaleString("sv-SE")} recension${totalReviews !== 1 ? "er" : ""}`}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/reviews">
            Visa alla
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
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
          {ratings.map((r) => (
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

      {latest ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Senaste recension</h3>
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex text-amber-500">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={cn("h-4 w-4", s <= latest.rating ? "fill-current" : "fill-amber-200")}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDate(latest.createdAt)}
            </span>
          </div>
          {latest.title && (
            <p className="font-medium text-sm">{latest.title}</p>
          )}
          {latest.comment && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {latest.comment}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{latest.userName}</span>
            {latest.orderId && (
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Verifierat köp
              </span>
            )}
          </div>
        </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          Inga recensioner ännu
        </div>
      )}
    </div>
  );
}
