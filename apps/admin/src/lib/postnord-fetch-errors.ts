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
        " Produktions-token ska till gate.ess.postnord.com (PostNord dokumentation). Åtgärd: byt DNS på servern till t.ex. Cloudflare 1.1.1.1 eller Google 8.8.8.8, starta om nät/resolver och testa: dig gate.ess.postnord.com @1.1.1.1";
    }
    return `${endpointLabel}: Ingen HTTPS-kontakt med PostNord (${hint}). Inte saknad client_secret (den ger HTTP 401/400 från token-URL:en med JSON).${extra}`;
  }
  return causeMsg ? `${endpointLabel}: ${top} (${causeMsg})` : `${endpointLabel}: ${top}`;
}
