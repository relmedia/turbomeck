/**
 * Compact copy of the checkout, attached to the Stripe PaymentIntent.
 *
 * The authoritative snapshot is the `checkout_intent` row in product-service.
 * This is the second copy, living with the payment itself, and it buys two
 * things the database row cannot:
 *
 *   - an order can be reconstructed from Stripe alone, even if the snapshot
 *     write failed or the database was restored from an older backup;
 *   - whoever opens the payment in the Stripe dashboard sees who it was for
 *     and what was in it, instead of a bare amount.
 *
 * Stripe caps each value at 500 characters, so items are encoded compactly and
 * truncated with an explicit marker rather than silently cut.
 */

type MetadataItem = {
  productId?: number;
  productName?: string;
  variant?: string | null;
  price?: number;
  quantity?: number;
};

type MetadataSource = {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  servicePointName?: string;
  deliveryOption?: string;
  couponCode?: string;
  subtotal?: number;
  shippingCost?: number;
  discount?: number;
  total?: number;
  userId?: string;
  locale?: string;
  items?: MetadataItem[];
};

const MAX_VALUE = 500;

/** `2x Garrett GT1749V (13C) @7490` per line, newest dropped first if too long. */
function encodeItems(items: MetadataItem[]): { value: string; truncated: boolean } {
  const lines = items.map((it) => {
    const qty = it.quantity ?? 1;
    const name = (it.productName ?? "?").slice(0, 60);
    const variant = it.variant ? ` (${String(it.variant).slice(0, 30)})` : "";
    const id = it.productId != null ? `#${it.productId} ` : "";
    return `${qty}x ${id}${name}${variant} @${it.price ?? 0}`;
  });

  let value = lines.join(" | ");
  if (value.length <= MAX_VALUE) return { value, truncated: false };

  const kept: string[] = [];
  const suffix = " | …";
  for (const line of lines) {
    const candidate = [...kept, line].join(" | ") + suffix;
    if (candidate.length > MAX_VALUE) break;
    kept.push(line);
  }
  value = kept.join(" | ") + suffix;
  return { value: value.slice(0, MAX_VALUE), truncated: true };
}

export function buildStripeCheckoutMetadata(
  source: MetadataSource,
): Record<string, string> {
  const items = Array.isArray(source.items) ? source.items : [];
  const { value: itemsValue, truncated } = encodeItems(items);

  const entries: Array<[string, string | number | undefined]> = [
    ["customer_email", source.email],
    ["customer_name", [source.firstName, source.lastName].filter(Boolean).join(" ")],
    ["customer_phone", source.phone],
    ["ship_address", source.address],
    ["ship_postal_code", source.postalCode],
    ["ship_city", source.city],
    ["ship_country", source.country],
    ["ship_service_point", source.servicePointName],
    ["delivery_option", source.deliveryOption],
    ["coupon_code", source.couponCode],
    ["subtotal_sek", source.subtotal],
    ["shipping_sek", source.shippingCost],
    ["discount_sek", source.discount],
    ["total_sek", source.total],
    ["user_id", source.userId],
    ["locale", source.locale],
    ["item_count", items.length],
    ["items", itemsValue],
    ["items_truncated", truncated ? "true" : undefined],
    // Marks which side wrote this, so an importer can tell a real snapshot
    // from a hand-edited payment.
    ["source", "turbomeck-storefront"],
  ];

  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value == null || value === "") continue;
    out[key] = String(value).slice(0, MAX_VALUE);
  }
  return out;
}
