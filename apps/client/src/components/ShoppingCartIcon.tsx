"use client";

import useCartStore from "@/stores/cartStore";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";

const ShoppingCartIcon = () => {
  const { cart, hasHydrated } = useCartStore();

  if (!hasHydrated) {
    return (
      <div className="relative">
        <ShoppingBag className="w-4 h-4 text-gray-600" />
        <span className="absolute -top-2.5 -right-2.5 cart-icon text-white rounded-full min-w-4 h-4 flex items-center justify-center text-xs font-medium px-1 bg-red-500">
          0
        </span>
      </div>
    );
  }

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <Link href="/cart" className="relative">
      <ShoppingBag className="w-4 h-4 text-gray-600" />
      <span className="absolute -top-2.5 -right-2.5 cart-icon text-white rounded-full min-w-4 h-4 flex items-center justify-center text-xs font-medium px-1 bg-red-500">
        {cartCount}
      </span>
    </Link>
  );
};

export default ShoppingCartIcon;
