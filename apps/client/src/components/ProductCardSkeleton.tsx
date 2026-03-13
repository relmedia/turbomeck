import { Skeleton } from "@/components/ui/skeleton";

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col h-full shadow-lg rounded-lg overflow-hidden">
      <Skeleton className="aspect-[4/3] shrink-0 rounded-none" />
      <div className="flex flex-col gap-4 p-4 flex-1">
        <Skeleton className="h-5 w-3/4" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        <div className="flex items-center justify-between mt-auto pt-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </div>
  );
}
