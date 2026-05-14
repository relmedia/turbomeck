import { Skeleton } from "@repo/ui/components/skeleton";

export function DashboardDataTableSkeleton({
  filterChips = 3,
  columns = 6,
  rows = 8,
}: {
  filterChips?: number;
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: filterChips }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-[92px]" />
          ))}
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="rounded-md border bg-card">
        <div className="border-b p-2">
          <div className="flex gap-2">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
        </div>
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} className="flex gap-2 border-b p-2 last:border-0">
            {Array.from({ length: columns }).map((_, ci) => (
              <Skeleton key={ci} className="h-9 flex-1" />
            ))}
          </div>
        ))}
        <div className="flex items-center justify-end gap-2 border-t p-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </div>
  );
}

function CardBlockSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function DashboardOrderDetailSkeleton() {
  return (
    <div className="space-y-4 p-4 w-full">
      <Skeleton className="h-9 w-36" />
      <div className="grid gap-4 md:grid-cols-2">
        <CardBlockSkeleton />
        <CardBlockSkeleton />
      </div>
      <CardBlockSkeleton lines={6} />
    </div>
  );
}

export function DashboardProductEditSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
        <div className="space-y-4">
          <Skeleton className="aspect-square w-full max-w-md rounded-lg" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

export function DashboardProductViewSkeleton() {
  return (
    <div className="space-y-6 px-4">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="aspect-4/5 w-full max-w-lg rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-9 w-[75%]" />
          <Skeleton className="h-6 w-[45%]" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
    </div>
  );
}

export function DashboardReviewsSectionSkeleton() {
  return (
    <div className="space-y-4 py-4">
      {[0, 1, 2].map((key) => (
        <div key={key} className="rounded-lg border p-5 space-y-3">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[90%]" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSliderPageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-full max-w-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <CardBlockSkeleton lines={6} />
        <CardBlockSkeleton lines={6} />
      </div>
    </div>
  );
}

export function DashboardCouponsTableSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/30 p-2">
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, ri) => (
        <div key={ri} className="flex gap-2 border-b p-3 last:border-0">
          {Array.from({ length: 5 }).map((_, ci) => (
            <Skeleton key={ci} className="h-7 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardBestSellingTableSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b p-2">
        <div className="flex gap-2">
          <Skeleton className="h-4 flex-2" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-10 shrink-0" />
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, ri) => (
        <div key={ri} className="flex items-center gap-2 border-b p-3 last:border-0">
          <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
          <Skeleton className="h-5 flex-2" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
        </div>
      ))}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <Skeleton className="h-4 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}
