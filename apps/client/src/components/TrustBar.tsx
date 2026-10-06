"use client";

import { ArrowLeftRight, Headset, ShieldCheck, Truck } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import { BRAND } from "@/lib/brand";

/**
 * Reassurance strip below the hero.
 *
 * It borrows the hero's type and frame language — square corners, `gray-200`
 * hairlines, uppercase wide-tracked labels, italic grey body copy, and
 * `tabular-nums` indices echoing the 01/02/03 slide counters — and sits flush
 * against it, forming the hero's plinth.
 *
 * Flush means the two must not both draw an edge there: the hero carries
 * `border-b-0` and this section's top border is the single hairline between
 * them. The elevation lives on the wrapper in `app/page.tsx` so one shadow
 * surrounds the pair instead of each casting onto the other.
 *
 * Colour comes from the logo, not from the colour wheel: icons sit in a green
 * tint on white, and the hover rule is the same green. Four unrelated hues read
 * as decoration; one brand colour used consistently reads as a system — and it
 * is the colour customers already associate with the shop.
 *
 * Light palette on purpose — the hero is light in both themes and this sits
 * directly under it.
 *
 * Every claim maps to behaviour that exists in the code, so the page can't
 * drift from the product:
 *   - delivery window matches `orderSuccess.nextStep3Body`
 *   - checkout is Stripe-hosted; card data never reaches our servers
 *   - the 14-day core return is the Exchange Turbo flow (commitsCoreReturnWithin14)
 *   - the support address is SHOP_CONTACT_EMAIL from the order emails
 */

const ITEMS = [
  { icon: Truck, title: "trustBar.shippingTitle", body: "trustBar.shippingBody" },
  { icon: ShieldCheck, title: "trustBar.paymentTitle", body: "trustBar.paymentBody" },
  { icon: ArrowLeftRight, title: "trustBar.exchangeTitle", body: "trustBar.exchangeBody" },
  { icon: Headset, title: "trustBar.supportTitle", body: "trustBar.supportBody" },
] as const;

export function TrustBar() {
  const t = useTranslation();

  return (
    <section
      aria-label={t("trustBar.sectionLabel")}
      className="border border-gray-200 bg-gray-200"
    >
      {/* gap-px over a grey ground draws the hairlines, so they stay exact at
          every breakpoint without per-cell nth-child border rules. */}
      <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, title, body }, i) => (
          <div
            key={title}
            className="group/trust relative flex items-start gap-3.5 px-5 py-5 transition-colors duration-300 md:px-6 md:py-6"
            style={{ background: "#ffffff" }}
          >
            {/* Logo-green rule, wiping in on hover. */}
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-500 ease-out group-hover/trust:scale-x-100"
              style={{ backgroundColor: BRAND.green }}
              aria-hidden
            />

            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover/trust:scale-105"
              style={{ backgroundColor: BRAND.greenTint }}
              aria-hidden
            >
              <Icon
                className="size-[19px]"
                style={{ color: BRAND.greenInk }}
                strokeWidth={1.75}
              />
            </span>

            <div className="min-w-0 flex-1">
              <h3
                className="text-[11px] font-bold uppercase leading-none tracking-[0.16em]"
                style={{ color: BRAND.ink }}
              >
                {t(title)}
              </h3>
              <p className="mt-2 text-xs italic leading-relaxed text-gray-500">
                {t(body)}
              </p>
            </div>

            {/* Index, mirroring the hero's slide counters. */}
            <span
              className="shrink-0 text-[10px] font-medium tabular-nums text-gray-300 transition-colors duration-300"
              aria-hidden
            >
              {String(i + 1).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
