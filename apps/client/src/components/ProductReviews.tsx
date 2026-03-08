"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { fetchReviews, type ApiReview, type ReviewsResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";

type ReviewsContextValue = {
  data: ReviewsResponse | null;
  loading: boolean;
  error: string | null;
};

const ReviewsContext = createContext<ReviewsContextValue | null>(null);

function useReviews() {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error("ProductReviewsSection must be used within ProductReviewsProvider");
  return ctx;
}

function ReviewCard({ review }: { review: ApiReview }) {
  const t = useTranslation();
  const date = new Date(review.createdAt).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-2 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={cn(
                "h-4 w-4",
                i <= review.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
              )}
            />
          ))}
        </div>
        <span className="font-medium text-foreground">{review.userName}</span>
        {review.verifiedPurchase && (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            {t("reviews.verifiedPurchase")}
          </span>
        )}
        <span className="text-sm text-muted-foreground">{date}</span>
      </div>
      {review.title && (
        <h4 className="font-medium">{review.title}</h4>
      )}
      {review.comment && (
        <p className="text-sm text-muted-foreground">{review.comment}</p>
      )}
    </div>
  );
}

export function ProductReviewsProvider({
  productId,
  children,
}: {
  productId: number;
  children: React.ReactNode;
}) {
  const t = useTranslation();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReviews(productId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("reviews.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, t]);

  const value: ReviewsContextValue = {
    data,
    loading,
    error,
  };

  return (
    <ReviewsContext.Provider value={value}>
      {children}
    </ReviewsContext.Provider>
  );
}

export function ProductReviewsSummary() {
  const { data, loading, error } = useReviews();
  const t = useTranslation();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        {t("reviews.loading")}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  const avgRating = data?.averageRating ?? 0;
  const totalCount = data?.totalCount ?? 0;
  const fullStars = Math.round(avgRating);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <div
        className="flex items-center gap-0.5"
        aria-label={`${avgRating.toFixed(1)} ${t("reviews.starsLabel")}`}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              "h-4 w-4",
              i <= fullStars ? "fill-amber-400 text-amber-400" : "text-gray-200"
            )}
          />
        ))}
      </div>
      <span className="font-medium text-foreground">{avgRating.toFixed(1)}</span>
      <span className="text-muted-foreground">
        ({totalCount} {totalCount === 1 ? t("common.review") : t("common.reviews")})
      </span>
    </div>
  );
}

export function ProductReviewsSection() {
  const { data, loading, error } = useReviews();
  const t = useTranslation();

  return (
    <div className="space-y-6">
      {!loading && !error && data && data.reviews.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">{t("reviews.title")}</h3>
          <div className="divide-y rounded-lg border p-4">
            {data.reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Legacy: single component for backward compat. Prefer ProductReviewsProvider + Summary + Section. */
export function ProductReviews({ productId }: { productId: number }) {
  return (
    <ProductReviewsProvider productId={productId}>
      <div className="space-y-6">
        <ProductReviewsSummary />
        <ProductReviewsSection />
      </div>
    </ProductReviewsProvider>
  );
}
