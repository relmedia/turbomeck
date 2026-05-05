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
    return `${endpointLabel}: Ingen HTTPS-kontakt med PostNord (${hint}). Inte relaterad till saknad client_secret (den ger ett OAuth-svarskod, inte fetch failed).`;
  }
  return causeMsg ? `${endpointLabel}: ${top} (${causeMsg})` : `${endpointLabel}: ${top}`;
}
