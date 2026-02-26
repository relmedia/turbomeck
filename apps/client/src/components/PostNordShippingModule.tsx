"use client";

import type { FC } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CartItemType } from "@/types";
import type { ShippingFormInputs } from "@/types";

const SCRIPT_URL =
  process.env.NEXT_PUBLIC_POSTNORD_SHIPPING_MODULE_URL ||
  "https://devportal.postnord.com/pn-shipping-module/v1";

export type PostNordShippingSelection = {
  sessionId: string;
  shipmentOptionId?: string;
  servicePointId?: string;
  price?: number;
  currency?: string;
  displayName?: string;
};

type PostNordShippingModuleProps = {
  formData: Partial<ShippingFormInputs>;
  cartItems: CartItemType[];
  language?: "sv" | "en";
  onShippingChange?: (selection: PostNordShippingSelection | null) => void;
  onLoaded?: () => void;
  onError?: (message: string) => void;
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.type = "application/ecmascript";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

const PostNordShippingModule: FC<PostNordShippingModuleProps> = ({
  formData,
  cartItems,
  language = "sv",
  onShippingChange,
  onLoaded,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const widgetRef = useRef<Element | null>(null);

  const fetchSession = useCallback(async () => {
    if (!sessionId || !sessionToken) return null;
    const res = await fetch(`/api/postnord/shipping/session/${sessionId}`, {
      headers: { Authorization: sessionToken },
    });
    if (!res.ok) return null;
    return res.json();
  }, [sessionId, sessionToken]);

  const createSession = useCallback(async () => {
    setStatus("loading");
    try {
      const items = cartItems.map((item) => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        weight: item.weight ?? 1,
      }));

      const res = await fetch("/api/postnord/shipping/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          deliveryAddress: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            address: formData.address,
            postalCode: formData.postalCode,
            city: formData.city,
            country: formData.country ?? "SE",
          },
          userInputs: {
            email: formData.email,
            phone: formData.phone,
            phoneCountryTwoLetterIso: formData.country ?? "SE",
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? data.details ?? "Failed to create session");
      }

      const data = await res.json();
      const id = data.sessionId ?? data.id;
      const token = data.sessionToken ?? data.authKey;
      if (!id) throw new Error("No session ID returned");
      setSessionId(id);
      setSessionToken(token ?? null);
      setStatus("ready");
      return { sessionId: id, sessionToken: token };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create session";
      setStatus("error");
      onError?.(msg);
    }
  }, [cartItems, formData, onError]);

  const hasMinData =
    Boolean(formData.country) &&
    Boolean(formData.postalCode) &&
    Boolean(formData.firstName) &&
    Boolean(formData.lastName) &&
    Boolean(formData.email) &&
    Boolean(formData.phone) &&
    cartItems.length > 0;

  useEffect(() => {
    if (!hasMinData) {
      setStatus("idle");
      return;
    }
    createSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMinData]);

  useEffect(() => {
    if (status !== "ready" || !sessionId || !containerRef.current) return;

    const container = containerRef.current;

    loadScript(`${SCRIPT_URL}/postnord-shipping-module.cjs`)
      .then(() => {
        const tag = document.createElement("postnord-shipping-module");
        tag.setAttribute("language", language);
        tag.setAttribute("session-id", sessionId);
        if (sessionToken) {
          tag.setAttribute(
            "modules",
            JSON.stringify({ sessionToken })
          );
        }
        tag.setAttribute("option-logos", "");

        container.innerHTML = "";
        container.appendChild(tag);
        widgetRef.current = tag;

        tag.addEventListener("loaded", () => {
          onLoaded?.();
        });

        tag.addEventListener("shippingUpdated", async () => {
          const session = await fetchSession();
          if (session?.selectedOption) {
            const opt = session.selectedOption;
            onShippingChange?.({
              sessionId,
              shipmentOptionId: opt.id ?? opt.shipmentOptionId,
              servicePointId: opt.servicePointId,
              price: opt.price ?? opt.amount,
              currency: opt.currency ?? "SEK",
              displayName: opt.name ?? opt.description,
            });
          } else if (session) {
            onShippingChange?.({ sessionId });
          }
        });
      })
      .catch((err) => {
        setStatus("error");
        onError?.(err instanceof Error ? err.message : "Failed to load shipping widget");
      });

    return () => {
      if (widgetRef.current && container.contains(widgetRef.current)) {
        container.removeChild(widgetRef.current);
      }
    };
  }, [status, sessionId, sessionToken, language, fetchSession, onLoaded, onShippingChange, onError]);

  if (status === "idle") {
    return (
      <p className="text-sm text-muted-foreground">
        Fyll i dina uppgifter ovan för att se PostNord fraktalternativ.
      </p>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <span className="animate-pulse">Laddar fraktalternativ...</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">
          Kunde inte ladda PostNord fraktalternativ. Kontrollera att
          POSTNORD_SHIPPING_API_URL och POSTNORD_SHIPPING_API_KEY är konfigurerade.
        </p>
        <p className="text-xs text-muted-foreground">
          För att aktivera PostNord Shipping Module, se{" "}
          <a
            href="https://devportal.postnord.com/pn-shipping-module/v1/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            PostNord utvecklarportalen
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-[120px] postnord-shipping-container"
    />
  );
};

export default PostNordShippingModule;
