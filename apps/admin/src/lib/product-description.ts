const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function productDescriptionText(
  html: string | null | undefined,
): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&[a-z#0-9]+;/gi,
      (entity) => ENTITIES[entity.toLowerCase()] ?? " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function shortDescriptionFromFull(
  html: string | null | undefined,
): string {
  const text = productDescriptionText(html);
  const maxLength = 100;
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
