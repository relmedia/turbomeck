"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORT_OPTIONS = [
  { value: "newest", label: "Nyaste" },
  { value: "oldest", label: "Äldst" },
  { value: "asc", label: "Pris: Låg till hög" },
  { value: "desc", label: "Pris: Högst till lågt" },
] as const;

export function ProductsToolbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sort = searchParams.get("sort") ?? "newest";

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("sort", value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex items-center justify-end gap-2 mb-6">
      <span className="text-sm text-muted-foreground">Sortera:</span>
      <Select value={sort} onValueChange={handleSortChange}>
          <SelectTrigger className="w-[180px] h-9 border-border/60 bg-background">
            <SelectValue placeholder="Välj sortering" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
    </div>
  );
}
