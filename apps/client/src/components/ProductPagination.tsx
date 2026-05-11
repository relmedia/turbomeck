"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@repo/ui/components/pagination";

const PAGE_SIZE = 8;

export function ProductPagination({
  pathname,
  category,
  currentPage,
  totalProducts,
}: {
  pathname: string;
  category: string;
  currentPage: number;
  totalProducts: number;
}) {
  const totalPages = Math.ceil(totalProducts / PAGE_SIZE);
  if (totalPages <= 1) return null;

  const makeHref = (page: number) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      const showLeft = currentPage > 3;
      const showRight = currentPage < totalPages - 2;
      pages.push(1);
      if (showLeft) pages.push("ellipsis");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
        if (i !== 1 && i !== totalPages) pages.push(i);
      }
      if (showRight) pages.push("ellipsis");
      if (totalPages > 1) pages.push(totalPages);
    }
    return pages;
  };

  return (
    <Pagination className="mt-8">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={currentPage <= 1 ? "#" : makeHref(currentPage - 1)}
            className={
              currentPage <= 1 ? "pointer-events-none opacity-50" : undefined
            }
          />
        </PaginationItem>
        {getPageNumbers().map((page, i) =>
          page === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <PaginationLink
                href={makeHref(page)}
                isActive={currentPage === page}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        <PaginationItem>
          <PaginationNext
            href={
              currentPage >= totalPages ? "#" : makeHref(currentPage + 1)
            }
            className={
              currentPage >= totalPages
                ? "pointer-events-none opacity-50"
                : undefined
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
