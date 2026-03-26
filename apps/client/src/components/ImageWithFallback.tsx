"use client";

import Image, { ImageProps } from "next/image";
import { useState, useEffect } from "react";

const PLACEHOLDER = "/logo.svg";

/**
 * Next.js Image with fallback when the source returns 404 or fails to load.
 */
export function ImageWithFallback({
  src,
  alt,
  fallback = PLACEHOLDER,
  sizes,
  fill,
  ...props
}: ImageProps & { fallback?: string }) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  const resolvedSizes =
    sizes ??
    (fill
      ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
      : undefined);

  return (
    <Image
      {...props}
      fill={fill}
      sizes={resolvedSizes}
      src={errored ? fallback : src}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}
