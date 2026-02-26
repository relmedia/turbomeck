"use client";

import { usePathname } from "next/navigation";

export function PageTitle() {
  const pathname = usePathname();

  const getTitle = () => {
    if (pathname === "/studio") return "Dashboard";
    if (pathname === "/studio/products/add") return "Lägg till produkt";
    if (pathname.startsWith("/studio/products")) return "Produkter";
    if (pathname.startsWith("/studio/users")) return "Användare";
    if (pathname.startsWith("/studio/payments")) return "Transaktioner";
    if (pathname.startsWith("/studio/categories")) return "Kategorier";
    if (pathname.startsWith("/studio/account")) return "Konto";
    return "Dashboard";
  };

  return (
    <h1 className="text-2xl font-semibold tracking-tight">{getTitle()}</h1>
  );
}
