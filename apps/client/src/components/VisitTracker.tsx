"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function getDeviceType(): "mobile" | "desktop" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const w = window.innerWidth;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function getBrowser(): "chrome" | "safari" | "firefox" | "edge" | "other" {
  if (typeof window === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/edg\//i.test(ua)) return "edge";
  if (/chrome|crios/i.test(ua) && !/edg|opr|opera/i.test(ua)) return "chrome";
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) return "safari";
  if (/opr|opera/i.test(ua)) return "chrome"; // Opera uses Chromium
  return "other";
}

const VISIT_SENT_KEY = "turbomeck-visit-sent";

export function VisitTracker() {
  const pathname = usePathname();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    const sent = sessionStorage.getItem(VISIT_SENT_KEY);
    if (sent) return;
    sessionStorage.setItem(VISIT_SENT_KEY, "1");
    sentRef.current = true;

    const deviceType = getDeviceType();
    const browser = getBrowser();
    fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceType, browser, path: pathname ?? "/" }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
