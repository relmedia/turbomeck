import { CartStoreActionsType, CartStoreStateType } from "@/types";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const useCartStore = create<CartStoreStateType & CartStoreActionsType>()(
  persist(
    (set) => ({
      cart: [],
      hasHydrated: false,
      addToCart: (product) =>
        set((state) => {
          const existingIndex = state.cart.findIndex(
            (p) =>
              p.id === product.id &&
              p.selectedSize === product.selectedSize &&
              p.selectedColor === product.selectedColor &&
              (p.selectedVariant ?? "") === (product.selectedVariant ?? "")
          );
          if (existingIndex !== -1) {
            const updatedCart = [...state.cart];
            updatedCart[existingIndex]!.quantity += product.quantity || 1;
            return { cart: updatedCart };
          }

          return {
            cart: [
              ...state.cart,
              {
                ...product,
                quantity: product.quantity || 1,
                selectedSize: product.selectedSize,
                selectedColor: product.selectedColor,
                selectedVariant: product.selectedVariant,
              },
            ],
          };
        }),
      removeFromCart: (product) =>
        set((state) => ({
          cart: state.cart.filter(
            (p) =>
              !(
                p.id === product.id &&
                p.selectedSize === product.selectedSize &&
                p.selectedColor === product.selectedColor &&
                (p.selectedVariant ?? "") === (product.selectedVariant ?? "")
              )
          ),
        })),
      updateQuantity: (product, newQuantity) =>
        set((state) => {
          if (newQuantity < 1) {
            return {
              cart: state.cart.filter(
                (p) =>
                  !(
                    p.id === product.id &&
                    p.selectedSize === product.selectedSize &&
                    p.selectedColor === product.selectedColor &&
                    (p.selectedVariant ?? "") === (product.selectedVariant ?? "")
                  )
              ),
            };
          }
          const idx = state.cart.findIndex(
            (p) =>
              p.id === product.id &&
              p.selectedSize === product.selectedSize &&
              p.selectedColor === product.selectedColor &&
              (p.selectedVariant ?? "") === (product.selectedVariant ?? "")
          );
          if (idx === -1) return state;
          const next = [...state.cart];
          next[idx] = { ...next[idx]!, quantity: newQuantity };
          return { cart: next };
        }),
      clearCart: () => set({ cart: [] }),
    }),
    {
      name: "cart",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hasHydrated = true;
        }
      },
    }
  )
);

export default useCartStore;
