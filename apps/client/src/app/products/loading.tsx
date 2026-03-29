import { Skeleton } from "@/components/ui/skeleton";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";

export default function ProductsLoading() {
  return (
    <div className="w-full">
      <Skeleton className="h-9 w-full max-w-2xl rounded-lg mb-4" />
      <div className="flex items-center justify-end gap-2 mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-[180px]" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-8 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
