"use client";

import { ArrowLeftRight } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@repo/ui/components/button";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { useTranslation } from "@/i18n/context";
import useCompareStore, { MAX_COMPARE_ITEMS } from "@/stores/compareStore";

/**
 * Adds or removes a product from the comparison.
 *
 * Two shapes: `icon` sits on a product card next to the wishlist heart, `full`
 * is the labelled button for the product page.
 *
 * Until the persisted list has been read the button renders in its inactive
 * state rather than hiding. Hiding would shift the card's layout a frame after
 * hydration, and a control that appears late is a control people miss.
 */
export function CompareToggle({
  productId,
  variant = "icon",
  className,
}: {
  productId: number;
  variant?: "icon" | "full";
  className?: string;
}) {
  const t = useTranslation();
  const ids = useCompareStore((s) => s.ids);
  const hasHydrated = useCompareStore((s) => s.hasHydrated);
  const toggle = useCompareStore((s) => s.toggle);

  const active = hasHydrated && ids.includes(productId);
  const full = hasHydrated && ids.length >= MAX_COMPARE_ITEMS && !active;

  const handleClick = (e: React.MouseEvent) => {
    // Cards wrap their content in a link; comparing must not navigate.
    e.preventDefault();
    e.stopPropagation();
    if (full) {
      // Silence here would read as a broken button, so say why nothing happened.
      toast.info(t("compare.limitReached", { max: MAX_COMPARE_ITEMS }));
      return;
    }
    toggle(productId);
  };

  const label = active ? t("compare.remove") : t("compare.add");

  if (variant === "full") {
    return (
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        onClick={handleClick}
        aria-pressed={active}
        className={cn("cursor-pointer", className)}
      >
        <ArrowLeftRight className="size-4" aria-hidden />
        {label}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "size-8 rounded-full bg-background/80 shadow-none backdrop-blur-sm",
        className,
      )}
    >
      {/* Selected state is the brand colour and a heavier stroke, not a ring.
          A ring traced a hard outline around the button on a card that has no
          other outlines, and it fought with the control's own shape.

          Set inline because the colour has to beat whatever text colour the
          host passes in `className` — on a product card that is
          `text-muted-foreground`, which would otherwise win the cascade. */}
      <ArrowLeftRight
        className={cn("size-4 transition-colors", active && "stroke-[2.5]")}
        style={active ? { color: BRAND.greenInk } : undefined}
        aria-hidden
      />
    </Button>
  );
}
