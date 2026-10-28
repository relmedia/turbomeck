"use client";

import dynamic from "next/dynamic";

/**
 * The retrofit mounts an Unlayer editor, which touches `window` while loading
 * its iframe bridge, so it cannot be server-rendered.
 */
const ApplyLogoButton = dynamic(() => import("./ApplyLogoButton"), {
  ssr: false,
  loading: () => null,
});

export default function ApplyLogoClient() {
  return <ApplyLogoButton />;
}
