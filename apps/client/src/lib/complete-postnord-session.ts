import { extractPostNordTrackableShipmentId } from "./postnord-shipment-response-id";

/**
 * Books the shipment after checkout (PostNord Shipping Module complete-session).
 * Call after payment succeeds; returns shipment/tracking id or null.
 *
 * Pass `postNordSessionToken` when available — PostNord prefers the per-session token over the apikey.
 */
export async function completePostNordSessionFromCheckoutPayload(payload: {
  postNordSessionId?: string;
  postNordSessionToken?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  postalCode: string;
  country?: string;
  companyName?: string | null;
}): Promise<string | null> {
  const sid = payload.postNordSessionId?.trim();
  if (!sid) return null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (payload.postNordSessionToken) {
      headers.Authorization = payload.postNordSessionToken;
    }
    const res = await fetch(
      `/api/postnord/shipping/complete-session/${encodeURIComponent(sid)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          deliveryAddress: {
            firstName: payload.firstName,
            lastName: payload.lastName,
            address: payload.address,
            city: payload.city,
            postalCode: payload.postalCode,
            country: payload.country ?? "SE",
            companyName: payload.companyName ?? undefined,
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
    const data: unknown = await res.json();
    const id = extractPostNordTrackableShipmentId(data);
    return id;
  } catch {
    return null;
  }
}
