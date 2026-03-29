"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n/context";
import type { Order } from "@/lib/api";
import { resolveImageUrl } from "@/lib/api";
import type { MyReview } from "@/lib/api";
import { fetchMyReviews, createReview, updateReview } from "@/lib/api";
import { Star, X, Pencil, Lock, Info } from "lucide-react";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, normalizeShopOrderNumber } from "@/lib/utils";
import { toast } from "react-toastify";

function OrderItemReviewForm({
  productId,
  productName,
  productImage,
  onSuccess,
}: {
  productId: number;
  productName: string;
  productImage: string | null;
  onSuccess: () => void;
}) {
  const t = useTranslation();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      toast.error(t("orderReviews.chooseRating"));
      return;
    }
    setLoading(true);
    try {
      await createReview({
        productId,
        rating,
        title: title.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      onSuccess();
      setTitle("");
      setComment("");
      setRating(0);
      toast.success(t("orderReviews.reviewSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("orderReviews.saveReviewError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 rounded-lg border bg-muted/30">
      <div className="flex gap-3">
        <div className="relative w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
          <ImageWithFallback
            src={resolveImageUrl(productImage)}
            alt={productName}
            fill
            className="object-cover"
            sizes="56px"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{productName}</p>
        </div>
      </div>
      <div>
        <Label className="mb-1 block text-sm">{t("orderReviews.rating")}</Label>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              className="rounded p-0.5 transition-colors hover:bg-muted"
              aria-label={t("orderReviews.starsAria", { count: i })}
            >
              <Star
                className={cn(
                  "h-5 w-5",
                  i <= rating ? "fill-black text-black" : "text-gray-200"
                )}
              />
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor={`title-${productId}`} className="text-sm">Rubrik (valfritt)</Label>
        <Input
          id={`title-${productId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="T.ex. Bra kvalitet"
          maxLength={100}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor={`comment-${productId}`} className="text-sm">{t("orderReviews.comment")}</Label>
        <textarea
          id={`comment-${productId}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("orderReviews.commentPlaceholder")}
          rows={3}
          className="mt-1 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? t("orderReviews.sending") : t("orderReviews.publishReview")}
      </Button>
    </form>
  );
}

function OrderItemReviewCard({
  item,
  review,
  onUpdated,
}: {
  item: { id: number; productId: number; productName: string; productImage: string | null };
  review: MyReview;
  onUpdated: () => void;
}) {
  const t = useTranslation();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(review.rating);
  const [title, setTitle] = useState(review.title ?? "");
  const [comment, setComment] = useState(review.comment ?? "");
  const [loading, setLoading] = useState(false);

  const canEdit = review.editedAt == null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      toast.error(t("orderReviews.chooseRating"));
      return;
    }
    setLoading(true);
    try {
      await updateReview(review.id, {
        rating,
        title: title.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      onUpdated();
      setEditing(false);
      toast.success(t("orderReviews.reviewUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("orderReviews.updateReviewError"));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setRating(review.rating);
    setTitle(review.title ?? "");
    setComment(review.comment ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <form onSubmit={handleSave} className="p-4 rounded-lg border bg-muted/30 space-y-3">
        <div className="flex gap-3">
          <div className="relative w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
            <ImageWithFallback
              src={resolveImageUrl(item.productImage)}
              alt={item.productName}
              fill
              className="object-cover"
              sizes="56px"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.productName}</p>
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-sm">{t("orderReviews.rating")}</Label>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i)}
                className="rounded p-0.5 transition-colors hover:bg-muted"
                aria-label={t("orderReviews.starsAria", { count: i })}
              >
                <Star
                  className={cn(
                    "h-5 w-5",
                    i <= rating ? "fill-black text-black" : "text-gray-200"
                  )}
                />
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-sm">{t("orderReviews.titleOptional")}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("orderReviews.titlePlaceholder")}
            maxLength={100}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-sm">{t("orderReviews.comment")}</Label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("orderReviews.commentPlaceholder")}
            rows={3}
            className="mt-1 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? t("account.saving") : t("orderReviews.saveChanges")}
          </Button>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
      <div className="flex gap-3">
        <div className="relative w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
          <ImageWithFallback
            src={resolveImageUrl(item.productImage)}
            alt={item.productName}
            fill
            className="object-cover"
            sizes="56px"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{item.productName}</p>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                className="shrink-0"
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                {t("orderReviews.edit")}
              </Button>
            ) : (
              <span className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                {t("orderReviews.locked")}
              </span>
            )}
          </div>
          <div className="flex gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={cn(
                  "h-4 w-4",
                  i <= review.rating ? "fill-black text-black" : "text-gray-200"
                )}
              />
            ))}
          </div>
        </div>
      </div>
      {review.title && (
        <p className="text-sm font-medium">{review.title}</p>
      )}
      {review.comment && (
        <p className="text-sm text-muted-foreground">{review.comment}</p>
      )}
    </div>
  );
}

type OrderReviewsModalProps = {
  order: Order | null;
  onClose: () => void;
};

export default function OrderReviewsModal({ order, onClose }: OrderReviewsModalProps) {
  const t = useTranslation();
  const [myReviews, setMyReviews] = useState<MyReview[]>([]);

  useEffect(() => {
    fetchMyReviews().then(setMyReviews);
  }, [order?.id]);

  if (!order) return null;

  const reviewedIds = myReviews.map((r) => r.productId);
  const itemsWithProductId = (order.items ?? []).filter(
    (item): item is typeof item & { productId: number } => item.productId != null
  );
  const unreviewedItems = itemsWithProductId.filter(
    (item) => !reviewedIds.includes(item.productId)
  );
  const reviewByProductId = new Map(myReviews.map((r) => [r.productId, r]));

  // No unreviewed products: all done or no products to review
  if (unreviewedItems.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-md backdrop-saturate-150 dark:bg-black/40 dark:backdrop-blur-lg"
        onClick={onClose}
      >
        <div
          className="bg-background rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between z-10">
            <h2 className="text-lg font-semibold">{t("orderReviews.yourReviews")}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              aria-label={t("common.close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            {itemsWithProductId.length === 0 ? (
              <p className="text-muted-foreground">
                {t("orderReviews.noProductsToReview")}
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {t("orderReviews.allReviewsDone")}
                  </p>
                  <div
                    className="flex gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                    role="status"
                  >
                    <Info className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      {t("orderReviews.editLimitNote")}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  {itemsWithProductId.map((item) => {
                    const review = reviewByProductId.get(item.productId);
                    if (!review) return null;
                    return (
                      <OrderItemReviewCard
                        key={item.id}
                        item={{
                          id: item.id,
                          productId: item.productId,
                          productName: item.productName,
                          productImage: item.productImage,
                        }}
                        review={review}
                        onUpdated={() => fetchMyReviews().then(setMyReviews)}
                      />
                    );
                  })}
                </div>
              </>
            )}
            <Button onClick={onClose} className="mt-2">
              {t("common.close")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-md backdrop-saturate-150 dark:bg-black/40 dark:backdrop-blur-lg"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold">{t("orderReviews.writeReview")}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("orderReviews.orderIntro", {
              orderNumber: normalizeShopOrderNumber(order.orderNumber),
            })}
          </p>
          <div className="space-y-4">
            {unreviewedItems.map((item) => (
              <OrderItemReviewForm
                key={item.id}
                productId={item.productId}
                productName={item.productName}
                productImage={item.productImage}
                onSuccess={() => fetchMyReviews().then(setMyReviews)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
