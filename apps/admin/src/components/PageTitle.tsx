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
    if (pathname === "/") return "Dashboard";
    if (pathname === "/products/add") return "Lägg till produkt";
    if (pathname.startsWith("/products")) return "Produkter";
    if (pathname.startsWith("/users")) return "Användare";
    if (pathname.startsWith("/payments")) return "Transaktioner";
    if (pathname.startsWith("/shipping")) return "Leveransdetaljer";
    if (pathname.startsWith("/categories")) return "Kategorier";
    if (pathname.startsWith("/coupons")) return "Kuponger";
    if (pathname.startsWith("/reviews")) return "Recensioner";
    if (pathname.startsWith("/account")) return "Konto";
    if (pathname.startsWith("/settings")) return "Inställningar";
    if (pathname.startsWith("/slider")) return "Startsidan slider";
    return "Dashboard";
  };

  const showBackButton =
    pathname === "/products/add" ||
    /^\/products\/[^/]+$/.test(pathname) ||
    /^\/products\/[^/]+\/view$/.test(pathname);

  return (
    <div className="flex items-center gap-3">
      {showBackButton && (
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            const page = fromPage ? parseInt(fromPage, 10) : 0;
            if (page > 1) {
              window.location.href = `/products?page=${page}`;
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
