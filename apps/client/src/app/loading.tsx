import { Skeleton } from "@repo/ui/components/skeleton";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";

export default function Loading() {
  return (
    <div className="">
      <Skeleton className="aspect-[3/1] w-full mb-12 rounded-lg" />
      <Skeleton className="h-9 w-full max-w-2xl rounded-lg mb-4" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-8 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
