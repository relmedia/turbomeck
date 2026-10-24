import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { postnordFetch } from "@/lib/postnord-node-dns";
import { describePostNordNetworkError } from "@/lib/postnord-fetch-errors";

/**
 * GET /api/postnord/servicepoints?postalCode=42530&country=SE
 *
 * Service points near an address, for the "Lägg till Order" modal. Booking a
 * shipment only works for collection at a service point
 * (postnord-book-shipment/route.ts), so an order created here has to carry a
 * real `servicePointId` or it can never be booked.
 *
 * Deliberately not shared with the storefront's richer version: that one
 * geocodes, falls back between endpoints and shapes results for a customer
 * picking a pickup point on a map. Admin needs a short list to choose from,
 * and importing across apps is not possible anyway.
 */

/** PostNord's own typeId filters, per country, from the v5 service point API. */
const TYPE_IDS: Record<string, string> = {
  SE: "24,25,54",
  NO: "37",
  DK: "6,44",
};

type ServicePoint = {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const params = request.nextUrl.searchParams;
  const postalCode = (params.get("postalCode") ?? "").replace(/\s/g, "").trim();
  const country = (params.get("country") ?? "SE").toUpperCase().trim();

  if (postalCode.length < 3) {
    return NextResponse.json(
      { error: "Postnummer krävs (minst 3 tecken)." },
      { status: 400 },
    );
  }
  const typeId = TYPE_IDS[country];
  if (!typeId) {
    return NextResponse.json(
      { error: "PostNord-ombud finns för SE, NO och DK." },
      { status: 400 },
    );
  }

  const apiKey = process.env.POSTNORD_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "POSTNORD_API_KEY saknas i admin-miljön." },
      { status: 503 },
    );
  }

  const host =
    process.env.POSTNORD_USE_TEST_API === "true"
      ? "atapi2.postnord.com"
      : (process.env.POSTNORD_API_HOST?.trim() || "api2.postnord.com").replace(
          /^https?:\/\//,
          "",
        );

  const url = new URL(
    `https://${host}/rest/businesslocation/v5/servicepoints/nearest/byaddress`,
  );
  url.searchParams.set("returnType", "json");
  url.searchParams.set("countryCode", country);
  url.searchParams.set("agreementCountry", country);
  url.searchParams.set("numberOfServicePoints", "10");
  url.searchParams.set("srId", "EPSG:4326");
  url.searchParams.set("context", "optionalservicepoint");
  url.searchParams.set("responseFilter", "public");
  url.searchParams.set("typeId", typeId);
  url.searchParams.set("located", "all");
  url.searchParams.set("whiteLabelName", "false");
  url.searchParams.set("postalCode", postalCode);
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await postnordFetch(url.toString(), { method: "GET" });
    const text = await res.text();
    if (!res.ok) {
      console.error("[admin/servicepoints]", res.status, text.slice(0, 300));
      return NextResponse.json(
        { error: `PostNord svarade ${res.status}.` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const raw = JSON.parse(text) as {
      servicePointInformationResponse?: {
        servicePoints?: Array<Record<string, unknown>>;
      };
    };

    const points: ServicePoint[] = (
      raw.servicePointInformationResponse?.servicePoints ?? []
    )
      .map((p) => {
        const addr = (p.deliveryAddress ?? p.visitingAddress) as
          | Record<string, unknown>
          | undefined;
        const street = [addr?.streetName, addr?.streetNumber]
          .filter((v) => typeof v === "string" && v.trim())
          .join(" ")
          .trim();
        return {
          id: String(p.servicePointId ?? "").trim(),
          name: String(p.name ?? "").trim(),
          address: street,
          postalCode: String(addr?.postalCode ?? "").trim(),
          city: String(addr?.city ?? "").trim(),
        };
      })
      // A point with no id cannot be booked against, so it is not an option.
      .filter((p) => p.id && p.name);

    return NextResponse.json({ servicePoints: points });
  } catch (err) {
    console.error("[admin/servicepoints]", err);
    return NextResponse.json(
      { error: describePostNordNetworkError("servicepoints", err) },
      { status: 502 },
    );
  }
}
