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
  ...props
}: ImageProps & { fallback?: string }) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  return (
    <Image
      {...props}
      src={errored ? fallback : src}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}
