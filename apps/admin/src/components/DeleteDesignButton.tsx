"use client";

/**
 * Deletes one email design.
 *
 * Safe by construction, which is worth knowing before reading the warning
 * below: the compiled template is still the fallback for every event, so
 * deleting a design never leaves an email unsendable. It reverts that mail to
 * the built-in version.
 *
 * The confirmation says so explicitly, and says it differently for an active
 * design, because that is the case where deleting changes what customers
 * receive on the very next order rather than just tidying a draft.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "react-toastify";

export default function DeleteDesignButton({
  id,
  name,
  locale,
  isActive,
}: {
  id: number;
  name: string;
  locale: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/designs?id=${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`"${name}" borttagen`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte ta bort mallen");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          title={`Ta bort "${name}"`}
        >
          <Trash2 className="size-3.5" aria-hidden />
          <span className="sr-only">Ta bort</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ta bort mallen?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Du tar bort <strong>&quot;{name}&quot;</strong> ({locale}). Det går inte att
                ångra.
              </p>
              {isActive ? (
                <p>
                  Mallen är <strong>aktiv</strong>. När den är borta skickas den inbyggda
                  standardmallen igen — inga mejl slutar fungera, men utseendet går tillbaka
                  till standard från nästa order.
                </p>
              ) : (
                <p>
                  Mallen är inaktiv och skickas inte i dag, så inget utskick påverkas.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              /** Keep the dialog open while the request is in flight. */
              e.preventDefault();
              void handleDelete();
            }}
            disabled={deleting}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Tar bort…
              </>
            ) : (
              "Ta bort"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
