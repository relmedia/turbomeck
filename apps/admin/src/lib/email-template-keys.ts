/**
 * The automated emails a design can replace.
 *
 * One list, because there were two: the designer's bind dropdown and the
 * design list's labels each carried their own copy, and a template added to
 * one but not the other either cannot be bound or shows up as a raw
 * `admin_new_order` in the list. The same drift this repo already paid for
 * between the PostNord config and its status checker.
 *
 * Order is the order someone meets these mails in, which is how a person
 * checking a set of templates reads down the page — not alphabetical. The
 * admin's own alert sits last: it is the one nobody outside the shop sees.
 */

export type EmailTemplateKey = {
  key: string;
  label: string;
  /**
   * Locales this mail actually exists in. The admin alert goes to the shop
   * rather than to a customer, so it has no second language to keep in step,
   * and offering one would invite a design that never sends.
   */
  locales: readonly string[];
};

export const EMAIL_TEMPLATE_KEYS: readonly EmailTemplateKey[] = [
  { key: "magic_link", label: "Inloggningslänk (logga in)", locales: ["sv", "en"] },
  { key: "order_confirmation", label: "Orderbekräftelse (tack för ditt köp)", locales: ["sv", "en"] },
  { key: "ready_for_pickup", label: "Klar att hämta", locales: ["sv", "en"] },
  { key: "pickup_reminder_1", label: "Påminnelse 1", locales: ["sv", "en"] },
  { key: "pickup_reminder_2", label: "Påminnelse 2", locales: ["sv", "en"] },
  { key: "order_delivered", label: "Levererad", locales: ["sv", "en"] },
  { key: "core_return_reminder", label: "Kärnretur — påminnelse", locales: ["sv", "en"] },
  { key: "admin_new_order", label: "Ny order (till admin)", locales: ["sv"] },
];

/** Label for a stored `templateKey`, falling back to the raw key. */
export function templateKeyLabel(key: string | null | undefined): string {
  if (!key) return "";
  return EMAIL_TEMPLATE_KEYS.find((t) => t.key === key)?.label ?? key;
}

/** Sort rank; anything unlisted — a standalone design — sorts last. */
export function templateKeyRank(key: string | null | undefined): number {
  const i = key ? EMAIL_TEMPLATE_KEYS.findIndex((t) => t.key === key) : -1;
  return i === -1 ? EMAIL_TEMPLATE_KEYS.length : i;
}

/** Whether this mail is sent to the shop rather than to a customer. */
export function isAdminTemplateKey(key: string | null | undefined): boolean {
  return key === "admin_new_order";
}
