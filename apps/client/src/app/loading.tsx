import { Skeleton } from "@/components/ui/skeleton";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";

export default function Loading() {
  return (
    <div className="">
      <Skeleton className="aspect-[3/1] w-full mb-12 rounded-lg" />
      <Skeleton className="h-9 w-full max-w-2xl rounded-lg mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
