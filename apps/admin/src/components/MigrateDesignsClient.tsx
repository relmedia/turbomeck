"use client";

import dynamic from "next/dynamic";

/**
 * The migration mounts an Unlayer editor, which touches `window` while loading
 * its iframe bridge, so it cannot be server-rendered — same reason the main
 * designer is loaded this way.
 */
const MigrateDesignsButton = dynamic(() => import("./MigrateDesignsButton"), {
  ssr: false,
  loading: () => null,
});

export default function MigrateDesignsClient() {
  return <MigrateDesignsButton />;
}
