"use client";

import { Heart } from "lucide-react";
import { useWishlist } from "@/hooks/useWishlist";
import { useRouter } from "next/navigation";

const WishlistIcon = () => {
  const { wishlist, loading, isSignedIn } = useWishlist();
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only navigate if there are items in wishlist and user is signed in
    if (!isSignedIn || wishlist.length === 0) {
      return;
    }
    
    router.push("/account");
  };

  if (loading) {
    return (
      <div className="relative cursor-pointer">
        <Heart className="w-4 h-4 text-gray-600" />
        <span className="absolute -top-2.5 -right-2.5 cart-icon text-white rounded-full min-w-4 h-4 flex items-center justify-center text-xs font-medium px-1 bg-red-500">
          0
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative cursor-pointer"
      aria-label="Önskelista"
      disabled={wishlist.length === 0}
    >
      <Heart className="w-4 h-4 text-gray-600" />
      <span className="absolute -top-2.5 -right-2.5 cart-icon text-white rounded-full min-w-4 h-4 flex items-center justify-center text-xs font-medium px-1 bg-red-500">
        {wishlist.length}
      </span>
    </button>
  );
};

export default WishlistIcon;
