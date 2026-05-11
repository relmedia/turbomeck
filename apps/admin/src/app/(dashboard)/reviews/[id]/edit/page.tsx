"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Star, ArrowLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

type Review = {
  id: number;
  productId: number;
  productName: string;
  userName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
};

export default function EditReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ rating: 5, title: "", comment: "" });

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/reviews/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            toast.error("Recension hittades inte");
            router.push("/reviews");
            return;
          }
          throw new Error("Kunde inte hämta");
        }
        const data = await res.json();
        setReview(data);
        setForm({
          rating: data.rating,
          title: data.title ?? "",
          comment: data.comment ?? "",
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ett fel uppstod");
        router.push("/reviews");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const handleSave = async () => {
    if (!review) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: form.rating,
          title: form.title.trim() || null,
          comment: form.comment.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Kunde inte uppdatera");
      }
      toast.success("Recension uppdaterad");
      router.push("/reviews");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte uppdatera");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !review) {
    return (
      <div className="flex justify-center h-64 items-center">
        <div className="animate-pulse text-muted-foreground">Laddar...</div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/reviews">Recensioner</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Redigera recension</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reviews">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Tillbaka
          </Link>
        </Button>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Redigera recension</CardTitle>
          <p className="text-sm text-muted-foreground">
            {review.productName} – {review.userName}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label>Betyg</Label>
            <div className="flex gap-0.5 mt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, rating: i }))}
                  className="p-0.5 rounded hover:bg-muted"
                >
                  <Star
                    className={cn(
                      "h-5 w-5",
                      i <= form.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="edit-title">Rubrik</Label>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Rubrik (valfritt)"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="edit-comment">Kommentar</Label>
            <textarea
              id="edit-comment"
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder="Kommentar"
              rows={4}
              className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link href="/reviews">Avbryt</Link>
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Sparar..." : "Spara"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
