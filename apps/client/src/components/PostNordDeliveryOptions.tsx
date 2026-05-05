"use client";

/**
 * PostNord Delivery Options renderer.
 *
 * Mirrors the visual language of PostNord's checkout showroom
 * (https://checkout-showroom.postnord.com/delivery-options):
 *
 *   - One card per delivery type (mailbox, home, parcel-locker, service-point, ...).
 *   - Icon + title on the left, friendly delivery ETA as a pill on the right.
 *   - Short description, sustainability badges (Svanenmärkt / Fossilfri).
 *   - For parcel-locker / service-point types, an expandable list of nearby pickup
 *     locations is rendered as sub-cards (name, distance, address, today's opening hours).
 *   - Selected card/sub-card is highlighted with a strong accent border + check icon.
 *
 * Server endpoint: POST /api/postnord/delivery-options
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  MapPin,
  AlertCircle,
  Leaf,
  Clock,
  Truck,
  Package,
  Mailbox,
  Home as HomeIcon,
  Check,
  ChevronDown,
  Globe,
} from "lucide-react";

import type {
  PostNordAddress,
  PostNordDeliveryAlternative,
  PostNordDeliveryOptionGroup,
  PostNordDeliveryOptionsResponse,
  PostNordDeliveryOptionsSelection,
  PostNordDeliveryType,
  PostNordOpeningHours,
  PostNordWarehouse,
  PostNordWarehouseDeliveryOptions,
} from "@/lib/postnord-delivery-options-types";

export type PostNordDeliveryOptionsProps = {
  recipient: PostNordAddress | null;
  /** Override the default warehouse(s) configured server-side. */
  warehouses?: PostNordWarehouse[];
  /** Restrict which delivery types to request. */
  deliveryTypes?: PostNordDeliveryType[];
  /** Override the customer key (defaults to POSTNORD_CUSTOMER_KEY on the server). */
  customerKey?: string;
  /**
   * Language for descriptiveTexts / friendlyDeliveryInfo coming back from PostNord.
   * Maps to the `Accept-Language` header on the upstream call. PostNord supports
   * `sv` and `en` (default falls back to Swedish).
   */
  language?: "sv" | "en";
  /** Pre-selected delivery option id (matches bookingInstructions.deliveryOptionId). */
  selectedDeliveryOptionId?: string | null;
  /** Fired with a compact selection object every time the user picks an alternative. */
  onSelectionChange?: (selection: PostNordDeliveryOptionsSelection | null) => void;
  /** Show the underlying request/response JSON for debugging. */
  debug?: boolean;
  className?: string;
};

const TYPE_TITLES: Record<PostNordDeliveryType, string> = {
  home: "Hemleverans",
  "parcel-locker": "Hämta i paketbox",
  "service-point": "Hämta hos ombud",
  mailbox: "Leverans till postlåda",
  "express-mailbox": "Snabb leverans till postlåda",
  groupage: "Hemleverans till tomtgräns",
  "international-parcel": "Internationell leverans",
};

const TYPE_ORDER: PostNordDeliveryType[] = [
  "home",
  "parcel-locker",
  "service-point",
  "mailbox",
  "express-mailbox",
  "groupage",
  "international-parcel",
];

/**
 * Delivery types that we never want to expose to the customer in checkout
 * (e.g. PostNord's mailbox / express-mailbox / "Hemleverans till tomtgräns" /
 * "groupage" – which surface as "Fast delivery to mailbox or door" and
 * "Home delivery to property front/curbside" cards).
 *
 * Acts both as a request filter (so PostNord doesn't return them) AND as a
 * defensive render filter (in case the API ever ignores the filter).
 */
const HIDDEN_DELIVERY_TYPES: ReadonlySet<PostNordDeliveryType> = new Set<
  PostNordDeliveryType
>(["mailbox", "express-mailbox", "groupage"]);

const VISIBLE_DELIVERY_TYPES: PostNordDeliveryType[] = TYPE_ORDER.filter(
  (t) => !HIDDEN_DELIVERY_TYPES.has(t),
);

function typeIcon(type: PostNordDeliveryType, className = "h-5 w-5") {
  switch (type) {
    case "home":
    case "groupage":
      return <HomeIcon className={className} />;
    case "parcel-locker":
      return <Package className={className} />;
    case "service-point":
      return <MapPin className={className} />;
    case "mailbox":
    case "express-mailbox":
      return <Mailbox className={className} />;
    case "international-parcel":
      return <Globe className={className} />;
    default:
      return <Truck className={className} />;
  }
}

function isAddressComplete(addr: PostNordAddress | null): addr is PostNordAddress {
  if (!addr) return false;
  return Boolean(
    addr.streetName?.trim() &&
      addr.postCode?.trim() &&
      addr.city?.trim() &&
      addr.countryCode?.trim(),
  );
}

function addressKey(addr: PostNordAddress | null): string {
  if (!isAddressComplete(addr)) return "";
  return [
    addr.streetName.trim().toLowerCase(),
    (addr.streetNumber ?? "").trim().toLowerCase(),
    addr.postCode.trim().toLowerCase(),
    addr.city.trim().toLowerCase(),
    addr.countryCode.trim().toUpperCase(),
  ].join("|");
}

function formatLatestDelivery(alt: PostNordDeliveryAlternative): string | undefined {
  if (alt.deliveryTime && "date" in alt.deliveryTime && alt.deliveryTime.date.latest) {
    try {
      const d = new Date(alt.deliveryTime.date.latest);
      return d.toLocaleString("sv-SE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return alt.deliveryTime.date.latest;
    }
  }
  if (alt.deliveryTime && "dayRange" in alt.deliveryTime) {
    return `${alt.deliveryTime.dayRange.days} dagar`;
  }
  return undefined;
}

function formatDistance(metres: number | undefined): string | undefined {
  if (typeof metres !== "number" || !Number.isFinite(metres)) return undefined;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const satisfies readonly (keyof PostNordOpeningHours["regular"])[];

function formatTodayOpeningHours(hours: PostNordOpeningHours | undefined): string | undefined {
  if (!hours?.regular) return undefined;
  const todayKey = WEEKDAY_KEYS[new Date().getDay()];
  if (!todayKey) return undefined;
  const day = hours.regular[todayKey];
  if (!day) return undefined;
  if (!day.open) return "Stängt idag";
  if (!day.timeRanges || day.timeRanges.length === 0) return undefined;
  return `Öppet idag ${day.timeRanges
    .map((r) => `${r.from}–${r.to}`)
    .join(", ")}`;
}

function altToSelection(
  warehouseId: string,
  type: PostNordDeliveryType,
  alt: PostNordDeliveryAlternative,
): PostNordDeliveryOptionsSelection {
  const checkout = alt.descriptiveTexts?.checkout;
  const latest =
    alt.deliveryTime && "date" in alt.deliveryTime
      ? alt.deliveryTime.date.latest
      : undefined;
  return {
    deliveryOptionId: alt.bookingInstructions.deliveryOptionId,
    type,
    serviceCode: alt.bookingInstructions.serviceCode,
    additionalServiceCodes: alt.bookingInstructions.additionalServiceCodes ?? [],
    ...(alt.bookingInstructions.servicePointId
      ? { servicePointId: alt.bookingInstructions.servicePointId }
      : {}),
    title: checkout?.title ?? TYPE_TITLES[type],
    ...(checkout?.friendlyDeliveryInfo
      ? { friendlyDeliveryInfo: checkout.friendlyDeliveryInfo }
      : {}),
    warehouseId,
    ...(alt.location?.name ? { locationName: alt.location.name } : {}),
    ...(alt.location?.address ? { locationAddress: alt.location.address } : {}),
    ...(latest ? { latestDelivery: latest } : {}),
  };
}

type ApiResult =
  | { ok: true; data: PostNordDeliveryOptionsResponse }
  | { ok: false; error: string };

type GroupForRender = {
  warehouse: PostNordWarehouse;
  type: PostNordDeliveryType;
  /** Headline alternative shown on the card (the defaultOption when present, else first additional). */
  primary: PostNordDeliveryAlternative;
  /** All alternatives (default + additional) for picker types. */
  alternatives: PostNordDeliveryAlternative[];
  /** True for types that have a list of pickup locations to choose from. */
  hasPicker: boolean;
};

const PostNordDeliveryOptions: React.FC<PostNordDeliveryOptionsProps> = ({
  recipient,
  warehouses,
  deliveryTypes,
  customerKey,
  language = "sv",
  selectedDeliveryOptionId,
  onSelectionChange,
  debug = false,
  className,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostNordDeliveryOptionsResponse | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    selectedDeliveryOptionId ?? null,
  );
  /** Which type cards have their pickup-location picker expanded. */
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const lastFetchedKeyRef = useRef<string>("");

  useEffect(() => {
    setInternalSelectedId(selectedDeliveryOptionId ?? null);
  }, [selectedDeliveryOptionId]);

  const recipientKey = useMemo(() => addressKey(recipient), [recipient]);

  const fetchOptions = useCallback(
    async (signal: AbortSignal): Promise<ApiResult> => {
      const requestedTypes =
        deliveryTypes && deliveryTypes.length > 0
          ? deliveryTypes.filter((t) => !HIDDEN_DELIVERY_TYPES.has(t))
          : VISIBLE_DELIVERY_TYPES;
      const res = await fetch("/api/postnord/delivery-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { address: recipient },
          warehouses,
          deliveryTypes: requestedTypes,
          customerKey,
          language,
        }),
        signal,
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok || !json || typeof json !== "object") {
        const message =
          (json && typeof json === "object" && "error" in json
            ? String((json as { error: unknown }).error)
            : null) ?? `HTTP ${res.status}`;
        return { ok: false, error: message };
      }
      const body = json as
        | { ok: true; data: PostNordDeliveryOptionsResponse }
        | { ok: false; error: string };
      if (body.ok) return { ok: true, data: body.data };
      return { ok: false, error: body.error || "Okänt fel" };
    },
    [recipient, warehouses, deliveryTypes, customerKey, language],
  );

  useEffect(() => {
    if (!isAddressComplete(recipient)) {
      setResult(null);
      setError(null);
      lastFetchedKeyRef.current = "";
      return;
    }
    const cacheKey = `${recipientKey}|${language}`;
    if (cacheKey === lastFetchedKeyRef.current) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      lastFetchedKeyRef.current = cacheKey;
      try {
        const res = await fetchOptions(controller.signal);
        if (controller.signal.aborted) return;
        if (res.ok) {
          setResult(res.data);
        } else {
          setResult(null);
          setError(res.error);
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Anropet misslyckades");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [recipient, recipientKey, language, fetchOptions]);

  const groupsForRender = useMemo<GroupForRender[]>(() => {
    if (!result) return [];
    const out: GroupForRender[] = [];

    const warehouseEntries: PostNordWarehouseDeliveryOptions[] =
      result.warehouseToDeliveryOptions ?? [];
    for (const entry of warehouseEntries) {
      const sortedTypes: PostNordDeliveryOptionGroup[] = [...(entry.deliveryOptions ?? [])].sort(
        (a, b) =>
          (TYPE_ORDER.indexOf(a.type) === -1 ? 99 : TYPE_ORDER.indexOf(a.type)) -
          (TYPE_ORDER.indexOf(b.type) === -1 ? 99 : TYPE_ORDER.indexOf(b.type)),
      );
      for (const grp of sortedTypes) {
        if (HIDDEN_DELIVERY_TYPES.has(grp.type)) continue;
        const alternatives = [
          ...(grp.defaultOption ? [grp.defaultOption] : []),
          ...(grp.additionalOptions ?? []),
        ];
        if (alternatives.length === 0) continue;
        const firstAlternative = alternatives[0];
        if (!firstAlternative) continue;
        const primary: PostNordDeliveryAlternative = grp.defaultOption ?? firstAlternative;
        const hasPicker =
          (grp.type === "service-point" || grp.type === "parcel-locker") &&
          (grp.additionalOptions?.length ?? 0) > 0;
        out.push({
          warehouse: entry.warehouse,
          type: grp.type,
          primary,
          alternatives,
          hasPicker,
        });
      }
    }
    return out;
  }, [result]);

  const handleSelectAlternative = (
    warehouseId: string,
    type: PostNordDeliveryType,
    alt: PostNordDeliveryAlternative,
  ) => {
    setInternalSelectedId(alt.bookingInstructions.deliveryOptionId);
    onSelectionChange?.(altToSelection(warehouseId, type, alt));
  };

  const toggleExpanded = (key: string) => {
    setExpandedTypes((s) => ({ ...s, [key]: !s[key] }));
  };

  if (!isAddressComplete(recipient)) {
    return (
      <div
        className={`rounded-xl border border-dashed p-5 text-sm text-muted-foreground ${className ?? ""}`}
      >
        Fyll i gata, postnummer, ort och land för att se PostNord-leveransalternativ.
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border bg-muted/30 p-5 text-sm text-muted-foreground ${className ?? ""}`}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Hämtar leveransalternativ från PostNord…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive ${className ?? ""}`}
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Kunde inte hämta leveransalternativ</p>
          <p className="text-destructive/80">{error}</p>
        </div>
      </div>
    );
  }

  if (groupsForRender.length === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed p-5 text-sm text-muted-foreground ${className ?? ""}`}
      >
        PostNord returnerade inga leveransalternativ för adressen.
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {groupsForRender.map((group) => {
        const { warehouse, type, primary, alternatives, hasPicker } = group;
        const expandKey = `${warehouse.id}-${type}`;
        const expanded = expandedTypes[expandKey] === true;

        // Has the user picked any alternative within this type?
        const isTypeSelected = alternatives.some(
          (a) => a.bookingInstructions.deliveryOptionId === internalSelectedId,
        );
        const selectedAltInGroup =
          alternatives.find(
            (a) => a.bookingInstructions.deliveryOptionId === internalSelectedId,
          ) ?? null;

        const checkout = primary.descriptiveTexts?.checkout;
        const friendly = checkout?.friendlyDeliveryInfo ?? formatLatestDelivery(primary);
        const isFossilFree = primary.sustainability?.fossilFree ?? false;
        const isSwanLabel = primary.sustainability?.nordicSwanEcoLabel ?? false;

        return (
          <div
            key={expandKey}
            className={`overflow-hidden rounded-xl border bg-background transition-all ${
              isTypeSelected
                ? "border-primary shadow-md ring-1 ring-primary/30"
                : "border-border hover:border-primary/40"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (hasPicker) {
                  toggleExpanded(expandKey);
                  if (!isTypeSelected) {
                    handleSelectAlternative(warehouse.id, type, primary);
                  }
                } else {
                  handleSelectAlternative(warehouse.id, type, primary);
                }
              }}
              className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/30"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                  isTypeSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-foreground/70"
                }`}
              >
                {typeIcon(type)}
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {checkout?.title ?? TYPE_TITLES[type]}
                  </p>
                  {friendly ? (
                    <span
                      className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
                        isTypeSelected
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Clock className="h-3 w-3" />
                      {friendly}
                    </span>
                  ) : null}
                </div>

                {checkout?.briefDescription ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {checkout.briefDescription}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {isSwanLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <Leaf className="h-3 w-3" /> Svanenmärkt
                    </span>
                  ) : null}
                  {isFossilFree ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <Leaf className="h-3 w-3" /> Fossilfri
                    </span>
                  ) : null}
                  {hasPicker ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                      {alternatives.length} platser nära dig
                    </span>
                  ) : null}
                  {isTypeSelected && selectedAltInGroup?.location?.name ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                      <MapPin className="h-3 w-3" />
                      {selectedAltInGroup.location.name}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-center gap-1 self-center">
                {isTypeSelected ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="h-6 w-6 rounded-full border-2 border-muted-foreground/25" />
                )}
                {hasPicker ? (
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                ) : null}
              </div>
            </button>

            {hasPicker && expanded ? (
              <div className="space-y-2 border-t bg-muted/20 px-3 py-3">
                {alternatives.map((alt) => {
                  const id = alt.bookingInstructions.deliveryOptionId;
                  const isSelected = internalSelectedId === id;
                  const distance = formatDistance(alt.location?.distanceFromRecipientAddress);
                  const todayHours = formatTodayOpeningHours(alt.location?.openingHours);
                  const altCheckout = alt.descriptiveTexts?.checkout;
                  const altFriendly =
                    altCheckout?.friendlyDeliveryInfo ?? formatLatestDelivery(alt);

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectAlternative(warehouse.id, type, alt)}
                      className={`flex w-full items-start gap-3 rounded-lg border bg-background p-3 text-left transition-all ${
                        isSelected
                          ? "border-primary shadow-sm ring-1 ring-primary/30"
                          : "border-border/60 hover:border-primary/40 hover:bg-background"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "border-2 border-muted-foreground/25 bg-background"
                        }`}
                      >
                        {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>

                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className="text-sm font-medium leading-snug">
                            {alt.location?.name ?? altCheckout?.title ?? TYPE_TITLES[type]}
                          </p>
                          {distance ? (
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              · {distance}
                            </span>
                          ) : null}
                        </div>

                        {alt.location?.address ? (
                          <p className="text-xs text-muted-foreground">
                            {alt.location.address.streetName}{" "}
                            {alt.location.address.streetNumber ?? ""}, {alt.location.address.postCode}{" "}
                            {alt.location.address.city}
                          </p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          {altFriendly ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {altFriendly}
                            </span>
                          ) : null}
                          {todayHours ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {todayHours}
                            </span>
                          ) : null}
                          {alt.sustainability?.nordicSwanEcoLabel ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                              <Leaf className="h-3 w-3" /> Svanenmärkt
                            </span>
                          ) : null}
                          {alt.sustainability?.fossilFree ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                              <Leaf className="h-3 w-3" /> Fossilfri
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      {debug && result ? (
        <details className="mt-2 rounded-lg border bg-muted/40 p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            Visa Delivery Options API-svar
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word">
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
};

export default PostNordDeliveryOptions;
