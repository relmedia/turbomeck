import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Which products the customer has put side by side.
 *
 * Only IDs are stored — never names, prices or image URLs.
 *
 * That is a deliberate security and correctness decision, not a space saving.
 * `localStorage` is writable by the page, so anything kept here is attacker- or
 * user-controlled input by the time it comes back: a tampered image URL would
 * be handed straight to `next/image`, and a tampered price would be shown as if
 * the shop had quoted it. Holding IDs alone means every figure the customer
 * reads is fetched fresh from the catalogue on open, so a price that changed
 * since they added the product cannot be displayed stale either.
 *
 * Even the IDs are not trusted: `sanitizeIds` runs on rehydrate and on every
 * write.
 */

/**
 * Four columns. Past that a comparison table stops being readable on anything
 * narrower than a desktop, and the point of the feature is to make a decision
 * easier, not to render a spreadsheet.
 */
export const MAX_COMPARE_ITEMS = 4;

/**
 * Coerces whatever came out of storage into a list of plausible product IDs.
 *
 * Product IDs are positive integers. Anything else — a string, a float, an
 * object, `Infinity`, a duplicate, or a fifth entry — is dropped rather than
 * passed to the API or rendered.
 */
function sanitizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const raw of value) {
    // Numbers only — deliberately not `Number(raw)`, which happily turns `true`
    // into 1 and `[5]` into 5, letting a tampered payload name a real product.
    // Nothing legitimate ever writes a non-number here.
    if (typeof raw !== "number") continue;
    const n = raw;
    if (!Number.isSafeInteger(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= MAX_COMPARE_ITEMS) break;
  }
  return out;
}

export type CompareStore = {
  ids: number[];
  /** False until the persisted list has been read, to avoid an SSR mismatch. */
  hasHydrated: boolean;
  /** Adds the product, or removes it when already present. */
  toggle: (id: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  /** True when adding another product would exceed the column limit. */
  isFull: () => boolean;
  has: (id: number) => boolean;
};

const useCompareStore = create<CompareStore>()(
  persist(
    (set, get) => ({
      ids: [],
      hasHydrated: false,

      toggle: (id) =>
        set((state) => {
          const [clean] = sanitizeIds([id]);
          if (clean === undefined) return state;
          if (state.ids.includes(clean)) {
            return { ids: state.ids.filter((x) => x !== clean) };
          }
          // Silently ignoring the click would look broken; the caller checks
          // `isFull()` first and explains why nothing happened.
          if (state.ids.length >= MAX_COMPARE_ITEMS) return state;
          return { ids: [...state.ids, clean] };
        }),

      remove: (id) =>
        set((state) => ({ ids: state.ids.filter((x) => x !== id) })),

      clear: () => set({ ids: [] }),

      isFull: () => get().ids.length >= MAX_COMPARE_ITEMS,

      has: (id) => get().ids.includes(id),
    }),
    {
      name: "compare",
      storage: createJSONStorage(() => localStorage),
      // Only the list is persisted; the actions and the hydration flag are not.
      partialize: (state) => ({ ids: state.ids }),
      merge: (persisted, current) => ({
        ...current,
        ids: sanitizeIds((persisted as { ids?: unknown } | null)?.ids),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.hasHydrated = true;
        // `merge` sanitises what we READ, but zustand only writes back on a
        // `set`, so a tampered payload would sit in storage indefinitely for
        // some future reader to trust. Writing the clean list straight back
        // removes it. One localStorage write per page load, and it makes the
        // stored value and the in-memory value provably the same thing.
        queueMicrotask(() => {
          useCompareStore.setState({ ids: sanitizeIds(state.ids) });
        });
      },
    },
  ),
);

export default useCompareStore;
