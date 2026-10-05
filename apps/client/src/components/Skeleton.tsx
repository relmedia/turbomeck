"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

const SHIMMER_GRADIENT =
  "linear-gradient(90deg, var(--skeleton-base) 25%, var(--skeleton-shimmer) 50%, var(--skeleton-base) 75%)";

const shimmerAnimate = { backgroundPosition: ["-200% 0", "200% 0"] };

const shimmerStyle: CSSProperties = {
  background: SHIMMER_GRADIENT,
  backgroundSize: "200% 100%",
};

/**
 * Loading placeholder with a shimmer sweeping left to right.
 * Size it with the same utility classes as any other box.
 */
function Skeleton({
  className,
  duration = 1.5,
  ...props
}: React.ComponentProps<typeof motion.div> & { duration?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-slot="skeleton"
      animate={reduceMotion ? undefined : shimmerAnimate}
      transition={{ duration, ease: "easeInOut", repeat: Infinity }}
      className={cn("shrink-0 rounded-md", className)}
      style={shimmerStyle}
      {...props}
    />
  );
}

/**
 * Shimmer that takes its shape from the real content it wraps: the children are
 * rendered invisibly to reserve their exact size, so the placeholder can't
 * disagree with the layout it stands in for.
 */
function SkeletonText({
  className,
  duration = 1.5,
  children,
}: {
  className?: string;
  duration?: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-slot="skeleton"
      animate={reduceMotion ? undefined : shimmerAnimate}
      transition={{ duration, ease: "easeInOut", repeat: Infinity }}
      className={cn("overflow-hidden rounded-md", className)}
      style={shimmerStyle}
      aria-hidden
    >
      <div className="invisible">{children}</div>
    </motion.div>
  );
}

export { Skeleton, SkeletonText };
