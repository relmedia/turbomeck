export type TrackingEvent = { time?: string; description?: string; location?: string };

/** Normalizes PostNord findByIdentifier JSON (v2/v5) into a chronological event list (newest first). */
export function extractTrackingEvents(data: Record<string, unknown>): TrackingEvent[] {
  const events: TrackingEvent[] = [];
  const root = (data.TrackingInformationResponse ?? data) as Record<string, unknown>;
  const shipments = (root.shipment ?? root.shipments ?? []) as unknown[];
  for (const s of Array.isArray(shipments) ? shipments : []) {
    const shipment = (s as Record<string, unknown>) ?? {};
    const items = (shipment.item ?? shipment.items ?? []) as unknown[];
    for (const it of Array.isArray(items) ? items : []) {
      const item = (it as Record<string, unknown>) ?? {};
      const evts = (item.event ?? item.events ?? []) as unknown[];
      for (const e of Array.isArray(evts) ? evts : []) {
        const ev = (e as Record<string, unknown>) ?? {};
        const loc = ev.location as Record<string, unknown> | undefined;
        const rawTime = ev.eventTime ?? ev.timestamp ?? ev.date;
        const rawDesc = ev.eventDescription ?? ev.description ?? ev.status;
        events.push({
          time: rawTime != null ? String(rawTime) : undefined,
          description: rawDesc != null ? String(rawDesc) : undefined,
          location: loc ? (String(loc.city ?? loc.name ?? loc.address ?? "").trim() || undefined) : undefined,
        });
      }
    }
  }
  return events.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
}
