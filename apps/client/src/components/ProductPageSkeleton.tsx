import { Skeleton } from "@/components/ui/skeleton";

export function ProductPageSkeleton() {
  return (
    <div className="flex flex-col gap-4 mt-6">
      <div className="flex flex-col gap-4 lg:flex-row md:gap-12 mt-4">
        {/* Image gallery skeleton */}
        <div className="w-full lg:w-5/12">
          <Skeleton className="aspect-square w-full rounded-lg" />
        </div>
        {/* Details skeleton */}
        <div className="w-full lg:w-7/12 flex flex-col gap-4">
          <div className="flex gap-1.5">
            <Skeleton className="h-3.5 w-8" />
            <Skeleton className="h-3.5 w-4" />
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-4" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-8 w-3/4" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
          <Skeleton className="h-8 w-24" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-16" />
          </div>
          <Skeleton className="h-11 w-full max-w-xs" />
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
      </div>
      {/* Reviews section skeleton */}
      <div className="mt-8 space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
