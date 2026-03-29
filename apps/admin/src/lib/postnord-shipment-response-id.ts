/**
 * Same as apps/client — extract trackable id from Booking API / Shipping Module JSON.
 * @see apps/client/src/lib/postnord-shipment-response-id.ts
 */

function pickStr(v: unknown): string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return t && t.toLowerCase() !== "null" ? t : undefined;
  }
  return undefined;
}

function trackingIdFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return (
      pickStr(u.searchParams.get("id")) ??
      pickStr(u.searchParams.get("shipmentId"))
    );
  } catch {
    return undefined;
  }
}

function extractFromIdInformation(root: Record<string, unknown>): string | null {
  const infos = root.idInformation;
  if (!Array.isArray(infos)) return null;

  for (const info of infos) {
    if (!info || typeof info !== "object") continue;
    const block = info as Record<string, unknown>;
    if (String(block.status ?? "").toUpperCase() === "ERROR") continue;

    const urls = block.urls;
    if (Array.isArray(urls)) {
      for (const u of urls) {
        if (!u || typeof u !== "object") continue;
        const ur = u as Record<string, unknown>;
        if (String(ur.type ?? "").toUpperCase() === "TRACKING" && typeof ur.url === "string") {
          const tid = trackingIdFromUrl(ur.url);
          if (tid) return tid;
        }
      }
    }
  }

  for (const info of infos) {
    if (!info || typeof info !== "object") continue;
    const block = info as Record<string, unknown>;
    const ids = block.ids;
    if (!Array.isArray(ids)) continue;
    for (const row of ids) {
      if (!row || typeof row !== "object") continue;
      const idRow = row as Record<string, unknown>;
      const v = pickStr(idRow.value);
      if (v) return v;
    }
  }

  return null;
}

function extractFromShipmentBlock(shipment: Record<string, unknown>): string | null {
  const sid = shipment.shipmentIdentification;
  if (sid && typeof sid === "object") {
    const v = pickStr((sid as Record<string, unknown>).shipmentId);
    if (v) return v;
  }
  return null;
}

export function extractPostNordTrackableShipmentId(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;

  const fromBooking = extractFromIdInformation(o);
  if (fromBooking) return fromBooking;

  const bookingId = pickStr(o.bookingId);
  if (bookingId) return bookingId;

  const direct =
    pickStr(o.shipmentId) ??
    pickStr(o.trackingId) ??
    pickStr(o.trackingNumber) ??
    pickStr(o.shipmentIdentificationNumber) ??
    pickStr(o.itemId) ??
    pickStr(o.parcelNumber);

  if (direct) return direct;

  const shipment = o.shipment;
  if (shipment && typeof shipment === "object") {
    const fromS = extractFromShipmentBlock(shipment as Record<string, unknown>);
    if (fromS) return fromS;
    const s = shipment as Record<string, unknown>;
    const nested =
      pickStr(s.shipmentId) ??
      pickStr(s.id) ??
      pickStr(s.trackingId) ??
      pickStr(s.trackingNumber);
    if (nested) return nested;
  }

  const shipments = o.shipments;
  if (Array.isArray(shipments) && shipments.length > 0) {
    const first = shipments[0];
    if (first && typeof first === "object") {
      const s0 = first as Record<string, unknown>;
      const fromArr =
        extractFromShipmentBlock(s0) ??
        pickStr(s0.shipmentId) ??
        pickStr(s0.id) ??
        pickStr(s0.trackingId);
      if (fromArr) return fromArr;
    }
  }

  const items = o.items;
  if (Array.isArray(items) && items.length > 0) {
    const first = items[0];
    if (first && typeof first === "object") {
      const it = first as Record<string, unknown>;
      const itemId = it.itemIdentification;
      if (itemId && typeof itemId === "object") {
        const v = pickStr((itemId as Record<string, unknown>).itemId);
        if (v) return v;
      }
      const fromItem = pickStr(it.itemId) ?? pickStr(it.id) ?? pickStr(it.trackingId);
      if (fromItem) return fromItem;
    }
  }

  const inner = o.data;
  if (inner != null && typeof inner === "object") {
    return extractPostNordTrackableShipmentId(inner);
  }

  return null;
}

/** First `printId` from Booking API 201 response (for PDF/ZPL label endpoints). */
export function extractPostNordPrintId(data: unknown): string | null {
  if (data == null || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const infos = root.idInformation;
  if (!Array.isArray(infos)) return null;
  for (const info of infos) {
    if (!info || typeof info !== "object") continue;
    const ids = (info as Record<string, unknown>).ids;
    if (!Array.isArray(ids)) continue;
    for (const row of ids) {
      if (!row || typeof row !== "object") continue;
      const p = (row as Record<string, unknown>).printId;
      if (typeof p === "string" && p.trim()) return p.trim();
    }
  }
  return null;
}
