"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

export function useWishlist() {
  const { data: session, status } = useSession();
  const isSignedIn = !!session?.user;
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    if (!isSignedIn) {
      setWishlist([]);
      setLoading(false);
      return;
    }
    fetch("/api/user/wishlist")
      .then((res) => res.json())
      .then((data) => setWishlist(data.wishlist ?? []))
      .catch(() => setWishlist([]))
      .finally(() => setLoading(false));
  }, [isSignedIn, status]);

  const toggle = useCallback(
    async (productId: number) => {
      if (!isSignedIn) return;
      const action = wishlist.includes(productId) ? "remove" : "add";
      setWishlist((prev) =>
        action === "add"
          ? [...prev, productId]
          : prev.filter((id) => id !== productId)
      );
      try {
        const res = await fetch("/api/user/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, action }),
        });
        const data = await res.json();
        if (!res.ok) {
          setWishlist((prev) =>
            action === "add" ? prev.filter((id) => id !== productId) : [...prev, productId]
          );
        } else if (Array.isArray(data.wishlist)) {
          setWishlist(data.wishlist);
        }
      } catch {
        setWishlist((prev) =>
          action === "add" ? prev.filter((id) => id !== productId) : [...prev, productId]
        );
      }
    },
    [isSignedIn, wishlist]
  );

  const isInWishlist = useCallback(
    (productId: number) => wishlist.includes(productId),
    [wishlist]
  );

  return { wishlist, toggle, isInWishlist, loading, isSignedIn };
}
