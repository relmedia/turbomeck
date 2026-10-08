"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { CookieTrigger } from "@/components/cookie-consent";
import { ContactModal } from "@/components/ContactModal";
import { useTranslation } from "@/i18n/context";
import { BRAND } from "@/lib/brand";

/**
 * Site footer.
 *
 * Shares the landing page's frame language rather than inventing a second one:
 * square corners, `gray-200` hairlines, uppercase wide-tracked headings,
 * italic grey body copy, and logo-green accents — the same vocabulary as
 * `TrustBar` and the category cards. The old version was a `rounded-lg` panel,
 * which made it the only rounded surface on the page.
 *
 * Light palette on purpose, like `Navbar` and `TrustBar`. `globals.css` still
 * defines a `.dark` block, but nothing sets that class and there is no theme
 * provider, so the previous `dark:` variants here could never render. Chrome
 * should be consistent: if a theme toggle is added, the navbar and this change
 * together.
 *
 * Every link points at a route that exists (`/`, `/products`, `/account`,
 * `/cart`, `/privacy`, `/terms`). The `footer.*` translations also carry keys
 * for About, FAQ, Blog, News, Bestsellers and Sale, which is presumably why a
 * previous iteration wanted them — those pages do not exist, and linking them
 * would ship a footer full of 404s.
 *
 * Categories are deliberately absent. They live in the database and
 * `fetchCategories` runs with `cache: "no-store"`, so mirroring the navbar's
 * tree here would add a second uncached request to every page load for links
 * the header already shows.
 *
 * The contact details are the ones used everywhere else — the address matches
 * the privacy policy's data-controller entry, and the payment badges match
 * what `PaymentForm` actually renders at checkout (card, Klarna, Stripe), so
 * the footer cannot promise a method the payment sheet does not offer.
 */

const PHONE_DISPLAY = "+46 709 16 50 06";
const PHONE_HREF = "tel:+46709165006";
const SHOP_EMAIL = "shop@turbomeck.se";
const ADDRESS_LINE_1 = "Husholmsgatan 4";
const ADDRESS_LINE_2 = "425 30 Hisings Kärra";
const MAPS_HREF =
  "https://www.google.com/maps/search/?api=1&query=Husholmsgatan+4+425+30+Hisings+K%C3%A4rra";

/** Shared link styling, so a column link and a legal link cannot drift apart. */
const linkClass =
  "text-sm leading-relaxed text-gray-600 transition-colors duration-200 hover:text-gray-900";

const columnHeadingClass =
  "text-[11px] font-bold uppercase leading-none tracking-[0.16em]";

function ContactRow({
  icon: Icon,
  children,
}: {
  icon: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-px flex size-8 shrink-0 items-center justify-center"
        style={{ backgroundColor: BRAND.greenTint }}
        aria-hidden
      >
        <Icon
          className="size-[15px]"
          style={{ color: BRAND.greenInk }}
          strokeWidth={1.75}
        />
      </span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed text-gray-600">
        {children}
      </span>
    </li>
  );
}

const Footer = () => {
  const t = useTranslation();
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <footer
      aria-label={t("footer.sectionLabel")}
      className="mt-16 border border-gray-200 bg-white"
    >
      {/* Logo-green cap, echoing TrustBar's hover rule — the one piece of
          colour that marks the end of the page. */}
      <div
        className="h-[3px] w-full"
        style={{ backgroundColor: BRAND.green }}
        aria-hidden
      />

      <div className="grid gap-10 px-5 py-10 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-8 md:px-8 md:py-12">
        {/* Brand, positioning line, and the three ways to reach a human. */}
        <div className="md:pr-6">
          <Link href="/" className="inline-flex items-center">
            <Image src="/logo.svg" alt="Turbomeck" width={32} height={32} />
            <span className="lightGreen ms-2 text-lg font-semibold italic tracking-wider">
              TURBO
            </span>
            <span className="text-lg font-semibold italic tracking-wider text-gray-700">
              MECK
            </span>
          </Link>

          <p className="mt-4 max-w-sm text-xs italic leading-relaxed text-gray-500">
            {t("footer.tagline")}
          </p>

          <ul className="mt-6 space-y-3">
            <ContactRow icon={Phone}>
              <a href={PHONE_HREF} className="transition-colors hover:text-gray-900">
                {PHONE_DISPLAY}
              </a>
            </ContactRow>
            <ContactRow icon={Mail}>
              <a
                href={`mailto:${SHOP_EMAIL}`}
                className="break-all transition-colors hover:text-gray-900"
              >
                {SHOP_EMAIL}
              </a>
            </ContactRow>
            <ContactRow icon={MapPin}>
              <a
                href={MAPS_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-gray-900"
              >
                {ADDRESS_LINE_1}
                <br />
                {ADDRESS_LINE_2}
              </a>
            </ContactRow>
          </ul>
        </div>

        {/* Shop */}
        <nav aria-labelledby="footer-shop">
          <h2
            id="footer-shop"
            className={columnHeadingClass}
            style={{ color: BRAND.ink }}
          >
            {t("footer.shop")}
          </h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href="/products" className={linkClass}>
                {t("footer.allProducts")}
              </Link>
            </li>
            <li>
              <Link href="/cart" className={linkClass}>
                {t("footer.cart")}
              </Link>
            </li>
            <li>
              <Link href="/account" className={linkClass}>
                {t("footer.myAccount")}
              </Link>
            </li>
          </ul>
        </nav>

        {/* Customer service */}
        <nav aria-labelledby="footer-service">
          <h2
            id="footer-service"
            className={columnHeadingClass}
            style={{ color: BRAND.ink }}
          >
            {t("footer.customerService")}
          </h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              {/* Opens the same guarded form as the header's Kontakt link,
                  rather than a mailto the visitor has to fill in themselves. */}
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className={`${linkClass} cursor-pointer text-left`}
              >
                {t("footer.contact")}
              </button>
            </li>
            <li>
              <a href={PHONE_HREF} className={linkClass}>
                {PHONE_DISPLAY}
              </a>
            </li>
            <li>
              <a href={`mailto:${SHOP_EMAIL}`} className={linkClass}>
                {SHOP_EMAIL}
              </a>
            </li>
          </ul>
        </nav>

        {/* Legal */}
        <nav aria-labelledby="footer-legal">
          <h2
            id="footer-legal"
            className={columnHeadingClass}
            style={{ color: BRAND.ink }}
          >
            {t("footer.legal")}
          </h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href="/terms" className={linkClass}>
                {t("footer.terms")}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={linkClass}>
                {t("footer.privacy")}
              </Link>
            </li>
            {/* CookieTrigger renders null until the visitor has answered the
                consent banner, so `empty:hidden` collapses the row instead of
                leaving a gap in the list. The condition stays in the trigger,
                where it belongs, rather than being duplicated here. */}
            <li className="empty:hidden">
              <CookieTrigger className={`${linkClass} cursor-pointer`}>
                {t("footer.cookieSettings")}
              </CookieTrigger>
            </li>
          </ul>
        </nav>
      </div>

      {/* Payment reassurance — the same three badges the checkout shows. */}
      <div className="border-t border-gray-200 bg-gray-50 px-5 py-5 md:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image
              src="/klarna.png"
              alt="Klarna"
              width={46}
              height={23}
              className="rounded-md"
            />
            <Image
              src="/cards.png"
              alt="Visa, Mastercard"
              width={46}
              height={23}
              className="rounded-md"
            />
            <Image
              src="/stripe.png"
              alt="Stripe"
              width={46}
              height={23}
              className="rounded-md"
            />
          </div>
          <p className="text-xs italic leading-relaxed text-gray-500">
            {t("footer.paymentNote")}
          </p>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-gray-200 px-5 py-4 md:px-8">
        <p className="text-xs text-gray-500">
          © {new Date().getFullYear()} Turbomeck.{" "}
          {t("footer.rightsReserved")}
        </p>
      </div>

      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </footer>
  );
};

export default Footer;
