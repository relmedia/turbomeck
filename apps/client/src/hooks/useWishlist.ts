"use client";

import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

export function useWishlist() {
  const { user, isSignedIn } = useUser();
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const savedWishlist = (user?.publicMetadata?.savedWishlist as number[] | undefined) ?? [];

  useEffect(() => {
    if (!isSignedIn) {
      setWishlist([]);
      setLoading(false);
      return;
    }
    setWishlist(savedWishlist);
    setLoading(false);
  }, [isSignedIn, JSON.stringify(savedWishlist)]);

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
        if (!res.ok) {
          setWishlist(savedWishlist);
        } else {
          const data = await res.json();
          setWishlist(data.wishlist ?? wishlist);
          await user?.reload();
        }
      } catch {
        setWishlist(savedWishlist);
      }
    },
    [isSignedIn, wishlist, savedWishlist, user]
  );

  const isInWishlist = useCallback(
    (productId: number) => wishlist.includes(productId),
    [wishlist]
  );

  return { wishlist, toggle, isInWishlist, loading, isSignedIn };
}
