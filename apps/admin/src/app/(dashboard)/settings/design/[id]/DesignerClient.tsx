"use client";

import dynamic from "next/dynamic";
import type { DesignRecord } from "@/components/EmailDesigner";

/**
 * The editor touches `window` while loading its iframe bridge, so it cannot be
 * server-rendered. ssr:false is required, not a preference — without it the
 * page throws "window is not defined" at module evaluation.
 */
const EmailDesigner = dynamic(() => import("@/components/EmailDesigner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
      Laddar editorn…
    </div>
  ),
});

export default function DesignerClient({ initial }: { initial: DesignRecord }) {
  return <EmailDesigner initial={initial} />;
}
