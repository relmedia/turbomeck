"use client";

/**
 * The media library.
 *
 * Every image in storage, with the two things a file listing normally cannot
 * tell you: who put it there, and whether anything still uses it. The second
 * is what makes the page safe to act on — "unused" is the only honest answer
 * to "can I delete this", and guessing it from filenames is how a product
 * loses its photo.
 *
 * Sorting and filtering are client-side on purpose. The bucket holds a few
 * hundred images at most, one request has them all, and paging a filter
 * through the server would add latency to every keystroke for a dataset that
 * fits comfortably in memory. If it ever outgrows that, the sort and filter
 * state here maps onto query parameters without reshaping the page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  ExternalLink,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "react-toastify";
import { resolveImageUrl } from "@/lib/image-utils";
import { DashboardDataTableSkeleton } from "@/components/dashboard-skeletons";

type Usage = { kind: "product" | "design"; id: number; name: string };

type MediaItem = {
  key: string;
  url: string;
  filename: string;
  folder: string;
  size: number;
  uploadedAt: string | null;
  uploadedAtIsExact: boolean;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
  originalName: string | null;
  usedBy: Usage[];
};

type SortKey = "filename" | "folder" | "size" | "uploadedAt" | "uploadedBy" | "usedBy";

/** Folders the bucket actually uses, named for what they are. */
const FOLDER_LABELS: Record<string, string> = {
  products: "Produktbilder",
  avatars: "Profilbilder",
  branding: "Logotyp",
  "email-assets": "E-postbilder",
  "email-art": "E-postgrafik",
  "övrigt": "Övrigt",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

/** "3 dagar sedan" reads faster than a date when scanning for what is new. */
function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return "idag";
  if (days === 1) return "igår";
  if (days < 30) return `${days} dagar sedan`;
  if (days < 365) return `${Math.floor(days / 30)} mån sedan`;
  return `${Math.floor(days / 365)} år sedan`;
}

export default function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("all");
  const [usage, setUsage] = useState("all");
  const [uploader, setUploader] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "uploadedAt",
    asc: false,
  });
  /** Object keys, not indexes: the list reorders under the selection. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<MediaItem[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/media", { cache: "no-store" });
      const json = (await res.json()) as { objects?: MediaItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setItems(json.objects ?? []);
      /** A refresh must not leave a selection pointing at vanished rows. */
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta bilderna");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runDelete = useCallback(
    async (targets: MediaItem[]) => {
      setDeleting(true);
      try {
        const res = await fetch("/api/media", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: targets.map((t) => t.key) }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          deleted?: number;
          failed?: number;
          results?: Array<{ key: string; deleted: boolean; error?: string; detachedFromProducts?: number[] }>;
        };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

        const deleted = json.deleted ?? 0;
        const detached = (json.results ?? []).flatMap((r) => r.detachedFromProducts ?? []);
        if (deleted > 0) {
          toast.success(
            `${deleted} ${deleted === 1 ? "bild" : "bilder"} borttagna` +
              (detached.length > 0
                ? ` · lossade från ${new Set(detached).size} produkt(er)`
                : ""),
          );
        }
        /**
         * Failures are named rather than counted. "3 misslyckades" tells you
         * nothing you can act on; the filename does.
         */
        const failures = (json.results ?? []).filter((r) => !r.deleted);
        if (failures.length > 0) {
          toast.error(
            `Kunde inte ta bort: ${failures
              .map((f) => `${f.key.split("/").pop()} (${f.error ?? "okänt fel"})`)
              .join(", ")}`,
            { autoClose: 12000 },
          );
        }

        /** Drop what actually went, rather than refetching the whole bucket. */
        const gone = new Set((json.results ?? []).filter((r) => r.deleted).map((r) => r.key));
        setItems((prev) => prev.filter((i) => !gone.has(i.key)));
        setSelected((prev) => new Set([...prev].filter((k) => !gone.has(k))));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Kunde inte ta bort bilderna");
      } finally {
        setDeleting(false);
        setPendingDelete(null);
      }
    },
    [],
  );

  const folders = useMemo(
    () => [...new Set(items.map((i) => i.folder))].sort(),
    [items],
  );
  const uploaders = useMemo(
    () => [...new Set(items.map((i) => i.uploadedByName).filter(Boolean) as string[])].sort(),
    [items],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (folder !== "all" && i.folder !== folder) return false;
      if (usage === "used" && i.usedBy.length === 0) return false;
      if (usage === "unused" && i.usedBy.length > 0) return false;
      if (uploader === "unknown" && i.uploadedByName) return false;
      if (uploader !== "all" && uploader !== "unknown" && i.uploadedByName !== uploader) return false;
      if (!q) return true;
      /** Searches what is on screen, plus what an image is used by. */
      return [
        i.filename,
        i.originalName ?? "",
        i.folder,
        i.uploadedByName ?? "",
        i.uploadedByEmail ?? "",
        ...i.usedBy.map((u) => u.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    const dir = sort.asc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "size":
          return (a.size - b.size) * dir;
        case "usedBy":
          return (a.usedBy.length - b.usedBy.length) * dir;
        case "uploadedAt":
          return (
            ((a.uploadedAt ? Date.parse(a.uploadedAt) : 0) -
              (b.uploadedAt ? Date.parse(b.uploadedAt) : 0)) *
            dir
          );
        case "uploadedBy":
          return (a.uploadedByName ?? "").localeCompare(b.uploadedByName ?? "", "sv") * dir;
        case "folder":
          return a.folder.localeCompare(b.folder, "sv") * dir;
        default:
          return a.filename.localeCompare(b.filename, "sv") * dir;
      }
    });
  }, [items, search, folder, usage, uploader, sort]);

  /**
   * "Select all" means every row currently VISIBLE, not every object in the
   * bucket. With filters applied, the other reading would quietly select
   * things that are not on screen — and this list ends in a delete button.
   */
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.key));
  const someVisibleSelected = visible.some((i) => selected.has(i.key));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const i of visible) next.delete(i.key);
      } else {
        for (const i of visible) next.add(i.key);
      }
      return next;
    });
  };

  const toggleOne = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.key)),
    [items, selected],
  );

  const totalSize = useMemo(() => items.reduce((sum, i) => sum + i.size, 0), [items]);
  const unusedCount = useMemo(() => items.filter((i) => i.usedBy.length === 0).length, [items]);

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => {
    const activeSort = sort.key === sortKey;
    const Icon = !activeSort ? ArrowUpDown : sort.asc ? ArrowUp : ArrowDown;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() =>
          setSort((s) => (s.key === sortKey ? { key: sortKey, asc: !s.asc } : { key: sortKey, asc: true }))
        }
      >
        {label}
        <Icon className={`ml-1.5 size-3.5 ${activeSort ? "" : "opacity-40"}`} aria-hidden />
      </Button>
    );
  };

  if (loading) return <DashboardDataTableSkeleton />;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Media</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} bilder · {formatBytes(totalSize)}
            {unusedCount > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => {
                    setUsage("unused");
                    setFolder("all");
                    setSearch("");
                  }}
                >
                  {unusedCount} används inte
                </button>
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
          Uppdatera
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök filnamn, uppladdare eller produkt…"
            className="h-9 pl-8"
          />
        </div>

        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder="Alla mappar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla mappar</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f} value={f}>
                {FOLDER_LABELS[f] ?? f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={usage} onValueChange={setUsage}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Används" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Används: alla</SelectItem>
            <SelectItem value="used">Används</SelectItem>
            <SelectItem value="unused">Används inte</SelectItem>
          </SelectContent>
        </Select>

        <Select value={uploader} onValueChange={setUploader}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Uppladdad av" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla uppladdare</SelectItem>
            {uploaders.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
            <SelectItem value="unknown">Okänd</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "bild vald" : "bilder valda"}
          </span>
          {selectedItems.some((i) => i.usedBy.length > 0) && (
            <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500">
              <TriangleAlert className="size-3.5" aria-hidden />
              {selectedItems.filter((i) => i.usedBy.length > 0).length} används
            </span>
          )}
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setSelected(new Set())}>
            Avmarkera
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto h-7"
            onClick={() => setPendingDelete(selectedItems)}
          >
            <Trash2 className="mr-1.5 size-3.5" aria-hidden />
            Ta bort {selected.size}
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAllVisible}
                  disabled={visible.length === 0}
                  aria-label="Markera alla synliga bilder"
                />
              </TableHead>
              <TableHead className="w-[76px]">Bild</TableHead>
              <TableHead>
                <SortHeader label="Filnamn" sortKey="filename" />
              </TableHead>
              <TableHead className="w-[150px]">
                <SortHeader label="Mapp" sortKey="folder" />
              </TableHead>
              <TableHead className="w-[100px]">
                <SortHeader label="Storlek" sortKey="size" />
              </TableHead>
              <TableHead className="w-[160px]">
                <SortHeader label="Uppladdad" sortKey="uploadedAt" />
              </TableHead>
              <TableHead className="w-[170px]">
                <SortHeader label="Av" sortKey="uploadedBy" />
              </TableHead>
              <TableHead className="w-[220px]">
                <SortHeader label="Används av" sortKey="usedBy" />
              </TableHead>
              <TableHead className="w-[90px] text-right">Åtgärd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-sm text-muted-foreground">
                  <ImageOff className="mx-auto mb-2 size-5 opacity-50" aria-hidden />
                  {items.length === 0
                    ? "Inga bilder i lagringen än."
                    : "Inga bilder matchar filtren."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((item) => (
                <TableRow key={item.key} data-state={selected.has(item.key) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(item.key)}
                      onCheckedChange={() => toggleOne(item.key)}
                      aria-label={`Markera ${item.filename}`}
                    />
                  </TableCell>
                  <TableCell>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                      title="Öppna i nytt fönster"
                    >
                      <span className="relative block size-12 overflow-hidden rounded border bg-muted">
                        <Image
                          src={resolveImageUrl(item.url)}
                          alt=""
                          fill
                          className="object-cover transition-transform hover:scale-110"
                          sizes="48px"
                          unoptimized
                        />
                      </span>
                    </a>
                  </TableCell>

                  <TableCell className="max-w-[260px]">
                    <p className="truncate text-sm font-medium" title={item.filename}>
                      {item.filename}
                    </p>
                    {item.originalName && item.originalName !== item.filename && (
                      <p className="truncate text-xs text-muted-foreground" title={item.originalName}>
                        original: {item.originalName}
                      </p>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {FOLDER_LABELS[item.folder] ?? item.folder}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {formatBytes(item.size)}
                  </TableCell>

                  <TableCell>
                    <p className="text-sm">{formatDate(item.uploadedAt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {relativeDate(item.uploadedAt)}
                      {/* The distinction matters: for older images this is
                          the file's last-modified date, not a recorded
                          upload, and it moves if the object is rewritten. */}
                      {item.uploadedAt && !item.uploadedAtIsExact && " (ca)"}
                    </p>
                  </TableCell>

                  <TableCell>
                    {item.uploadedByName ? (
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase">
                          {item.uploadedByName.slice(0, 2)}
                        </span>
                        <span className="truncate text-sm" title={item.uploadedByEmail ?? undefined}>
                          {item.uploadedByName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Okänd</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {item.usedBy.length === 0 ? (
                      <Badge variant="secondary" className="font-normal text-muted-foreground">
                        Används inte
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {item.usedBy.slice(0, 2).map((u) => (
                          <Link
                            key={`${u.kind}-${u.id}`}
                            href={u.kind === "product" ? `/products/${u.id}` : `/settings/design/${u.id}`}
                            className="max-w-[150px] truncate rounded border px-1.5 py-0.5 text-xs hover:bg-muted"
                            title={u.name}
                          >
                            {u.name}
                          </Link>
                        ))}
                        {item.usedBy.length > 2 && (
                          <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                            +{item.usedBy.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Kopiera adress"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(item.url)
                            .then(
                              () => toast.success("Adressen kopierad"),
                              () => toast.error("Kunde inte kopiera"),
                            );
                        }}
                      >
                        <Copy className="size-3.5" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" asChild title="Öppna">
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Ta bort"
                        onClick={() => setPendingDelete([item])}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/*
        The confirmation carries the consequence, not just a count.
        Deleting an unused image is housekeeping; deleting one a product
        shows is a visible change to the shop, and those must not look like
        the same action. Products are relinked automatically — an email
        design is not, so that case is called out separately.
      */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.length === 1
                ? "Ta bort bilden?"
                : `Ta bort ${pendingDelete?.length ?? 0} bilder?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Filerna raderas permanent från lagringen. Det går inte att ångra.</p>

                {(() => {
                  const inUse = (pendingDelete ?? []).filter((i) => i.usedBy.length > 0);
                  const inDesigns = inUse.filter((i) => i.usedBy.some((u) => u.kind === "design"));
                  if (inUse.length === 0) {
                    return (
                      <p className="text-emerald-700 dark:text-emerald-500">
                        Ingen av bilderna används av någon produkt eller e-postmall.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                      <p className="font-medium text-amber-900 dark:text-amber-300">
                        {inUse.length} av bilderna används just nu.
                      </p>
                      <ul className="space-y-0.5 text-xs text-amber-900/90 dark:text-amber-200/90">
                        {inUse.slice(0, 5).map((i) => (
                          <li key={i.key} className="truncate">
                            <strong>{i.filename}</strong> — {i.usedBy.map((u) => u.name).join(", ")}
                          </li>
                        ))}
                        {inUse.length > 5 && <li>…och {inUse.length - 5} till</li>}
                      </ul>
                      <p className="text-xs text-amber-900/90 dark:text-amber-200/90">
                        Produkter kopplas loss automatiskt och visar nästa bild i galleriet.
                      </p>
                      {inDesigns.length > 0 && (
                        <p className="text-xs font-medium text-destructive">
                          {inDesigns.length} används i en e-postmall. Mallar kopplas INTE loss —
                          bilden blir trasig i mejlet tills du ändrar mallen.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                /** Keep the dialog up while the request is in flight. */
                e.preventDefault();
                if (pendingDelete) void runDelete(pendingDelete);
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
                `Ta bort ${pendingDelete?.length ?? 0}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {visible.length > 0 && visible.length !== items.length && (
        <p className="text-xs text-muted-foreground">
          Visar {visible.length} av {items.length} bilder.
        </p>
      )}
    </section>
  );
}
