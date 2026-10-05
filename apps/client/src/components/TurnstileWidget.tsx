"use client";

import { useCallback, useEffect, useId, useRef } from "react";

/**
 * Cloudflare Turnstile widget.
 *
 * Renders nothing and reports no token when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is
 * unset, which is the local-dev and not-yet-configured case — the server side
 * (`lib/turnstile.ts`) skips verification under the same condition, so the two
 * halves switch on together.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so adding the key on a server needs
 * a rebuild, not just a restart.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      appearance?: "always" | "execute" | "interaction-only";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function turnstileConfigured(): boolean {
  return Boolean(SITE_KEY);
}

export function TurnstileWidget({
  onToken,
  className,
}: {
  /** Called with a fresh token, or "" when it expires and must be re-solved. */
  onToken: (token: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const instanceId = useId();

  const handleToken = useCallback(onToken, [onToken]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => handleToken(token),
          "expired-callback": () => handleToken(""),
          "error-callback": () => handleToken(""),
          theme: "auto",
          // Invisible unless Cloudflare decides the visitor needs to interact.
          appearance: "interaction-only",
        });
      })
      .catch(() => {
        // Script blocked (ad blocker, CSP, offline). The server rejects the
        // tokenless submit with a readable error rather than failing silently.
        handleToken("");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [handleToken, instanceId]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className={className} />;
}
