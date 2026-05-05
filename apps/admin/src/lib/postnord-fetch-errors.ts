/**
 * Undici/node fetch throws TypeError("fetch failed") with no HTTP body —
 * unlike OAuth rejections where you still get JSON from the token endpoint.
 */
export function describePostNordNetworkError(endpointLabel: string, err: unknown): string {
  if (!(err instanceof Error)) {
    return `${endpointLabel}: ${String(err)}`;
  }
  const causeMsg =
    err.cause instanceof Error
      ? err.cause.message
      : typeof err.cause === "object" && err.cause !== null && "message" in err.cause
        ? String((err.cause as { message?: unknown }).message ?? "")
        : "";
  const top = err.message.trim();
  if (top === "fetch failed" || top === "Failed to fetch") {
    const hint = causeMsg || "inget svar — vanligast: brandvägg, DNS, eller servern saknar internet";
    let extra = "";
    if (/ENOTFOUND/i.test(causeMsg) || /ENOTFOUND/i.test(top)) {
      extra =
        " dig fungerar men Node inte? Det är libc/getaddrinfo som ger ENOTFOUND. Lös genom att sätta POSTNORD_DNS_SERVERS=1.1.1.1,8.8.8.8 i apps/admin/.env (PostNord-anrop går då via dns.Resolver direkt — påverkar inte resten av appen) och starta om: `pm2 restart admin --update-env`.";
    }
    return `${endpointLabel}: Ingen HTTPS-kontakt med PostNord (${hint}). Inte saknad client_secret (den ger HTTP 401/400 från token-URL:en med JSON).${extra}`;
  }
  return causeMsg ? `${endpointLabel}: ${top} (${causeMsg})` : `${endpointLabel}: ${top}`;
}
