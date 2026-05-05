import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  fetchPostNordDeliveryOptions,
  type BuildDeliveryOptionsPayloadInput,
} from "@/lib/postnord-delivery-options";
import type { PostNordDeliveryType } from "@/lib/postnord-delivery-options-types";

export const runtime = "nodejs";

const ALLOWED_TYPES: PostNordDeliveryType[] = [
  "home",
  "parcel-locker",
  "service-point",
  "mailbox",
  "express-mailbox",
  "groupage",
  "international-parcel",
];

const addressSchema = z.object({
  streetName: z.string().min(1, "streetName krävs"),
  streetNumber: z.string().optional(),
  postCode: z.string().min(1, "postCode krävs"),
  city: z.string().min(1, "city krävs"),
  countryCode: z.string().min(2).max(3),
});

const warehouseSchema = z.object({
  id: z.string().min(1),
  address: addressSchema,
  orderHandling: z.object({
    timeOfLatestOrder: z.string().min(1),
  }),
});

const requestSchema = z.object({
  customerKey: z.string().trim().min(1).optional(),
  recipient: z.object({ address: addressSchema }),
  warehouses: z.array(warehouseSchema).optional(),
  deliveryTypes: z
    .array(z.enum(ALLOWED_TYPES as [PostNordDeliveryType, ...PostNordDeliveryType[]]))
    .optional(),
  /** Accept-Language for the upstream call (`sv` or `en`). */
  language: z.string().trim().min(2).max(10).optional(),
});

/**
 * POST /api/postnord/delivery-options
 *
 * Body:
 * {
 *   recipient: { address: { streetName, streetNumber?, postCode, city, countryCode } },
 *   warehouses?: PostNordWarehouse[],   // overrides the env-configured default warehouse
 *   deliveryTypes?: PostNordDeliveryType[],
 *   customerKey?: string
 * }
 *
 * Returns the upstream JSON together with the exact request payload, so the UI can
 * mirror PostNord’s “API anrop / API svar” debug view.
 */
export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof requestSchema>;
  try {
    const json = await req.json();
    parsed = requestSchema.parse(json);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : err instanceof Error
          ? err.message
          : "Ogiltig JSON-body";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 },
    );
  }

  const input: BuildDeliveryOptionsPayloadInput = {
    customerKey: parsed.customerKey,
    recipient: parsed.recipient,
    warehouses: parsed.warehouses,
    deliveryTypes: parsed.deliveryTypes,
    language: parsed.language ?? req.headers.get("accept-language") ?? undefined,
  };

  const result = await fetchPostNordDeliveryOptions(input);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        requestUrl: result.requestUrl,
        requestPayload: result.requestPayload,
        upstream: result.data,
      },
      { status: result.status >= 500 ? 502 : result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    requestUrl: result.requestUrl,
    requestPayload: result.requestPayload,
    data: result.data,
  });
}
