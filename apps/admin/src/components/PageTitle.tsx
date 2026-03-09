"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function PageTitle() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPage = searchParams.get("fromPage");

  const getTitle = () => {
    if (pathname === "/studio") return "Dashboard";
    if (pathname === "/studio/products/add") return "Lägg till produkt";
    if (pathname.startsWith("/studio/products")) return "Produkter";
    if (pathname.startsWith("/studio/users")) return "Användare";
    if (pathname.startsWith("/studio/payments")) return "Transaktioner";
    if (pathname.startsWith("/studio/shipping")) return "Leveransdetaljer";
    if (pathname.startsWith("/studio/categories")) return "Kategorier";
    if (pathname.startsWith("/studio/coupons")) return "Kuponger";
    if (pathname.startsWith("/studio/reviews")) return "Recensioner";
    if (pathname.startsWith("/studio/account")) return "Konto";
    if (pathname.startsWith("/studio/settings")) return "Inställningar";
    return "Dashboard";
  };

  const showBackButton =
    pathname === "/studio/products/add" ||
    /^\/studio\/products\/[^/]+$/.test(pathname) ||
    /^\/studio\/products\/[^/]+\/view$/.test(pathname);

  return (
    <div className="flex items-center gap-3">
      {showBackButton && (
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            const page = fromPage ? parseInt(fromPage, 10) : 0;
            if (page > 1) {
              window.location.href = `/studio/products?page=${page}`;
            } else {
              router.back();
            }
          }}
          aria-label="Gå tillbaka"
          className="cursor-pointer shrink-0 bg-muted hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">{getTitle()}</h1>
    </div>
  );
}
