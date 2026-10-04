"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckCircle2, Lock, LogIn, Star } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import {
  createReview,
  fetchReviewEligibility,
  type ApiReview,
  type MyReview,
} from "@/lib/api";
import { useProductReviews } from "./ProductReviews";

/** How many reviews are listed before the visitor asks for the rest. */
const INITIAL_VISIBLE = 3;

function Stars({ value, className }: { value: number; className?: string }) {
  const filled = Math.round(value);
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= filled ? "fill-amber-400 text-amber-400" : "text-gray-200 dark:text-gray-700"
          )}
        />
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function RatingSummary({
  average,
  total,
  reviews,
}: {
  average: number;
  total: number;
  reviews: ApiReview[];
}) {
  const t = useTranslation();
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  return (
    <div className="grid gap-6 rounded-xl border bg-card p-5 sm:grid-cols-[auto_1fr] sm:gap-8">
      <div className="flex flex-col items-center justify-center gap-1.5 sm:w-40">
        <span className="text-4xl font-semibold leading-none tabular-nums">
          {average.toFixed(1)}
        </span>
        <Stars value={average} />
        <span className="text-xs text-gray-500">
          {total} {total === 1 ? t("common.review") : t("common.reviews")}
        </span>
      </div>
      <div className="space-y-1.5" aria-label={t("reviews.ratingDistribution")}>
        {counts.map(({ star, count }) => (
          <div key={star} className="flex items-center gap-3 text-xs">
            <span className="w-6 shrink-0 tabular-nums text-gray-500">{star}★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
                style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
              />
            </div>
            <span className="w-6 shrink-0 text-right tabular-nums text-gray-500">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslation();
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHovered(i)}
          aria-label={t("orderReviews.starsAria", { count: i })}
          aria-pressed={value === i}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={cn(
              "h-7 w-7 transition-colors",
              i <= shown ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600"
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewForm({
  productId,
  onPublished,
}: {
  productId: number;
  onPublished: (review: MyReview) => void;
}) {
  const t = useTranslation();
  const { refresh } = useProductReviews();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      toast.error(t("orderReviews.chooseRating"));
      return;
    }
    setSaving(true);
    try {
      const result = await createReview({
        productId,
        rating,
        title: title.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      await refresh();
      onPublished({
        id: result.review.id,
        productId,
        rating,
        title: title.trim() || null,
        comment: comment.trim() || null,
        createdAt: result.review.createdAt,
        editedAt: null,
      });
      toast.success(t("orderReviews.reviewSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("orderReviews.saveReviewError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{t("reviews.writeReview")}</h3>
        <p className="inline-flex items-center gap-1.5 text-sm text-gray-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          {t("reviews.writeReviewIntro")}
        </p>
      </div>
      <div>
        <Label className="mb-1.5 block text-sm">{t("orderReviews.rating")}</Label>
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <div>
        <Label htmlFor="review-title" className="text-sm">
          {t("orderReviews.titleOptional")}
        </Label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("orderReviews.titlePlaceholder")}
          maxLength={100}
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="review-comment" className="text-sm">
          {t("orderReviews.comment")}
        </Label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("orderReviews.commentPlaceholder")}
          rows={4}
          maxLength={2000}
          className="mt-1.5 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? t("orderReviews.sending") : t("orderReviews.publishReview")}
      </Button>
    </form>
  );
}

/** Dashed card used for the logged-out and not-a-buyer states. */
function NoticeCard({
  icon: Icon,
  children,
}: {
  icon: typeof Lock;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
      <div className="space-y-2 text-sm text-gray-500">{children}</div>
    </div>
  );
}

function WriteReviewBlock({ productId }: { productId: number }) {
  const t = useTranslation();
  const pathname = usePathname();
  const { status } = useSession();
  const [eligibility, setEligibility] = useState<{
    hasPurchased: boolean;
    review: MyReview | null;
  } | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setEligibility(null);
      return;
    }
    let cancelled = false;
    fetchReviewEligibility(productId).then((res) => {
      if (!cancelled) setEligibility(res);
    });
    return () => {
      cancelled = true;
    };
  }, [productId, status]);

  if (status === "loading") {
    return <div className="h-24 animate-pulse rounded-xl bg-muted/50" />;
  }

  if (status !== "authenticated") {
    return (
      <NoticeCard icon={LogIn}>
        <p>{t("reviews.loginToReview")}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/logga-in?callbackUrl=${encodeURIComponent(pathname)}`}>
            {t("reviews.loginCta")}
          </Link>
        </Button>
      </NoticeCard>
    );
  }

  if (!eligibility) {
    return <div className="h-24 animate-pulse rounded-xl bg-muted/50" />;
  }

  if (eligibility.review) {
    const review = eligibility.review;
    return (
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{t("reviews.yourReview")}</h3>
          <span className="text-xs text-gray-500">{formatDate(review.createdAt)}</span>
        </div>
        <Stars value={review.rating} />
        {review.title && <p className="font-medium">{review.title}</p>}
        {review.comment && (
          <p className="whitespace-pre-line text-sm text-gray-500">{review.comment}</p>
        )}
        <p className="text-xs text-gray-500">{t("reviews.alreadyReviewed")}</p>
      </div>
    );
  }

  if (!eligibility.hasPurchased) {
    return (
      <NoticeCard icon={Lock}>
        <p>{t("reviews.purchaseRequired")}</p>
      </NoticeCard>
    );
  }

  return (
    <ReviewForm
      productId={productId}
      onPublished={(review) => setEligibility({ hasPurchased: true, review })}
    />
  );
}

function ReviewCard({ review }: { review: ApiReview }) {
  const t = useTranslation();
  const initial = review.userName?.trim().charAt(0) || "?";

  return (
    <li className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{review.userName}</span>
            {review.verifiedPurchase && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                {t("reviews.verifiedPurchase")}
              </span>
            )}
            <span className="text-xs text-gray-500">{formatDate(review.createdAt)}</span>
          </div>
          <Stars value={review.rating} />
          {review.title && <p className="font-medium">{review.title}</p>}
          {review.comment && (
            <p className="whitespace-pre-line text-sm text-gray-500">{review.comment}</p>
          )}
        </div>
      </div>
    </li>
  );
}

export function ProductReviewsPanel({ productId }: { productId: number }) {
  const t = useTranslation();
  const { data, loading, error } = useProductReviews();
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-xl bg-muted/50" />
        <div className="h-24 animate-pulse rounded-xl bg-muted/50" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  const reviews = data?.reviews ?? [];
  const visible = showAll ? reviews : reviews.slice(0, INITIAL_VISIBLE);

  return (
    <div className="max-w-3xl space-y-6">
      {reviews.length > 0 ? (
        <RatingSummary
          average={data?.averageRating ?? 0}
          total={data?.totalCount ?? reviews.length}
          reviews={reviews}
        />
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
          <Stars value={0} className="justify-center" />
          <p className="mt-2 text-sm text-gray-500">{t("reviews.empty")}</p>
        </div>
      )}

      <WriteReviewBlock productId={productId} />

      {reviews.length > 0 && (
        <div className="space-y-4">
          <ul className="space-y-4">
            {visible.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </ul>
          {reviews.length > INITIAL_VISIBLE && (
            <Button variant="outline" onClick={() => setShowAll((v) => !v)}>
              {showAll
                ? t("reviews.showLess")
                : t("reviews.showAll", { count: reviews.length })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
