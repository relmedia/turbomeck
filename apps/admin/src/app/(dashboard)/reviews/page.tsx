"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@repo/ui/components/button";
import { RefreshCw, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { type Review, createColumns } from "./columns";
import { DataTable } from "./data-table";
import { cn } from "@/lib/utils";
import { toast } from "react-toastify";

export default function ReviewsPage() {
  const [data, setData] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewReview, setViewReview] = useState<Review | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews");
      if (!res.ok) throw new Error("Failed to fetch reviews");
      const list = await res.json();
      setData(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching reviews:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Kunde inte ta bort");
        }
        toast.success("Recension borttagen");
        await fetchReviews();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Kunde inte ta bort");
        throw err;
      }
    },
    [fetchReviews]
  );

  const handleDeleteSelected = useCallback(
    async (selected: Review[]) => {
      for (const r of selected) {
        await handleDelete(r.id);
      }
    },
    [handleDelete]
  );

  const handleView = useCallback((review: Review) => {
    setViewReview(review);
  }, []);

  const columns = useMemo(
    () => createColumns(handleView, handleDelete),
    [handleView, handleDelete]
  );

  return (
    <div>
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Alla Recensioner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Översikt över alla produktrecensioner från kunder
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchReviews}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
          <Button variant="link" className="ml-2" onClick={fetchReviews}>
            Försök igen
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center h-64 items-center">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          onDeleteSelected={handleDeleteSelected}
        />
      )}

      {/* View modal */}
      <Dialog open={!!viewReview} onOpenChange={(o) => !o && setViewReview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recension</DialogTitle>
          </DialogHeader>
          {viewReview && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Produkt</p>
                <p className="font-medium">{viewReview.productName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Användare</p>
                <p>{viewReview.userName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Betyg</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={cn(
                        "h-4 w-4",
                        i <= viewReview.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
                      )}
                    />
                  ))}
                </div>
              </div>
              {viewReview.title && (
                <div>
                  <p className="text-sm text-muted-foreground">Rubrik</p>
                  <p>{viewReview.title}</p>
                </div>
              )}
              {viewReview.comment && (
                <div>
                  <p className="text-sm text-muted-foreground">Kommentar</p>
                  <p className="text-sm">{viewReview.comment}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Skapad</p>
                <p className="text-sm">
                  {new Date(viewReview.createdAt).toLocaleString("sv-SE")}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
