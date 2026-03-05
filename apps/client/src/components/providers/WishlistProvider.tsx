"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "next-auth/react";

type WishlistContextType = {
  wishlist: number[];
  loading: boolean;
  isSignedIn: boolean;
  toggle: (productId: number) => Promise<void>;
  isInWishlist: (productId: number) => boolean;
  refresh: () => void;
};

const WishlistContext = createContext<WishlistContextType | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const isSignedIn = !!session?.user;
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWishlist = useCallback(() => {
    if (!isSignedIn) {
      setWishlist([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/user/wishlist", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setWishlist(data.wishlist ?? []);
      })
      .catch((err) => {
        console.error("Failed to fetch wishlist:", err);
        setWishlist([]);
      })
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  useEffect(() => {
    if (status === "loading") return;
    fetchWishlist();
  }, [status, fetchWishlist]);

  const toggle = useCallback(
    async (productId: number) => {
      if (!isSignedIn) return;
      const action = wishlist.includes(productId) ? "remove" : "add";
      const previousWishlist = wishlist;
      
      // Optimistic update
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
          // Revert on error
          setWishlist(previousWishlist);
        } else if (Array.isArray(data.wishlist)) {
          setWishlist(data.wishlist);
        }
      } catch (err) {
        console.error("Failed to toggle wishlist:", err);
        // Revert on error
        setWishlist(previousWishlist);
      }
    },
    [isSignedIn, wishlist]
  );

  const isInWishlist = useCallback(
    (productId: number) => wishlist.includes(productId),
    [wishlist]
  );

  const value: WishlistContextType = {
    wishlist,
    loading,
    isSignedIn,
    toggle,
    isInWishlist,
    refresh: fetchWishlist,
  };

  return (
    <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextType {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error("useWishlist must be used within WishlistProvider");
  }
  return ctx;
}
