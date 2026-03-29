/**
 * Books the shipment after checkout (PostNord Shipping Module complete-session).
 * Call after payment succeeds; returns shipment/tracking id or null.
 */
export async function completePostNordSessionFromCheckoutPayload(payload: {
  postNordSessionId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  postalCode: string;
  country?: string;
}): Promise<string | null> {
  const sid = payload.postNordSessionId?.trim();
  if (!sid) return null;
  try {
    const res = await fetch(
      `/api/postnord/shipping/complete-session/${encodeURIComponent(sid)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryAddress: {
            firstName: payload.firstName,
            lastName: payload.lastName,
            address: payload.address,
            city: payload.city,
            postalCode: payload.postalCode,
            country: payload.country ?? "SE",
          },
          userInputs: {
            email: payload.email,
            phone: payload.phone,
            phoneCountryTwoLetterIso: payload.country ?? "SE",
          },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { shipmentId?: string; trackingId?: string };
    const id = data?.shipmentId ?? data?.trackingId ?? null;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}
