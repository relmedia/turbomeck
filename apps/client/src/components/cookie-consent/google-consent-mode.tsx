"use client";

import { useEffect } from "react";

export interface GoogleConsentModeDefaults {
  analytics_storage?: "granted" | "denied";
  ad_storage?: "granted" | "denied";
  ad_user_data?: "granted" | "denied";
  ad_personalization?: "granted" | "denied";
  functionality_storage?: "granted" | "denied";
  personalization_storage?: "granted" | "denied";
  security_storage?: "granted" | "denied";
}

export interface GoogleConsentModeProps {
  defaults?: GoogleConsentModeDefaults;
  waitForUpdate?: number;
  regions?: string[];
}

export function GoogleConsentMode({
  defaults = {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  },
  waitForUpdate = 500,
  regions,
}: GoogleConsentModeProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    (window as { dataLayer?: unknown[] }).dataLayer = (window as { dataLayer?: unknown[] }).dataLayer || [];

    if (!(window as { gtag?: (...args: unknown[]) => void }).gtag) {
      (window as { gtag?: (...args: unknown[]) => void }).gtag = function gtag(...args: unknown[]) {
        const w = window as { dataLayer?: unknown[] };
        if (w.dataLayer) w.dataLayer.push(args);
      };
    }

    const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
    if (gtag) {
      gtag("consent", "default", {
        ...defaults,
        wait_for_update: waitForUpdate,
        ...(regions?.length ? { region: regions } : {}),
      });
    }
  }, [defaults, waitForUpdate, regions]);

  return null;
}
