"use client";

import Image from "next/image";
import Link from "next/link";
import { CookieTrigger } from "@/components/cookie-consent";
import { useTranslation } from "@/i18n/context";

const Footer = () => {
  const t = useTranslation();
  return (
    <div className="mt-16 flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between md:gap-0 bg-gray-800 p-8 rounded-lg">
      <div className="flex flex-col gap-4 items-center md:items-start">
        <Link href="/" className="flex items-center">
          <Image src="/logo.svg" alt="Turbomeck" width={36} height={36} />
          <p className="hidden md:block text-xl font-semibold tracking-wider italic text-lightGreen ms-2 text-white">
            TURBO
          </p>
          <p className="hidden md:block text-xl font-semibold tracking-wider italic text-white">
            MECK
          </p>
        </Link>
        <p className="text-sm text-gray-400">© 2026 Turbomeck</p>
        <p className="text-sm text-gray-400">{t("footer.rightsReserved")}</p>
      </div>
      <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start">
        <p className="text-sm text-amber-50">{t("footer.quickLinks")}</p>
        <Link href="/">{t("footer.home")}</Link>
        <Link href="/privacy">{t("footer.privacy")}</Link>
        <Link href="/terms">{t("footer.terms")}</Link>
        <CookieTrigger className="hover:text-amber-50 transition-colors text-inherit">
          {t("footer.cookieSettings")}
        </CookieTrigger>
        <Link href="/terms">{t("footer.faq")}</Link>
      </div>
      <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start">
        <p className="text-sm text-amber-50">{t("footer.products")}</p>
        <Link href="/products">{t("footer.allProducts")}</Link>
        <Link href="/contact">{t("footer.news")}</Link>
        <Link href="/privacy">{t("footer.bestsellers")}</Link>
        <Link href="/terms">{t("footer.sale")}</Link>
      </div>
      <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start">
        <p className="text-sm text-amber-50">{t("footer.company")}</p>
        <Link href="/about">{t("footer.about")}</Link>
        <Link href="/contact">{t("footer.contact")}</Link>
        <Link href="/privacy">{t("footer.blog")}</Link>
        <Link href="/terms">{t("footer.terms")}</Link>
      </div>
      <div className="flex flex-col gap-4 text-sm text-gray-400 items-center md:items-start">
        <p className="text-sm text-amber-50">{t("footer.contact")}</p>
        <a
          href="tel:+46701234567"
          className="hover:text-amber-50 transition-colors"
        >
          +46 70 123 45 67
        </a>
        <a
          href="mailto:info@turbomeck.se"
          className="hover:text-amber-50 transition-colors"
        >
          info@turbomeck.se
        </a>
        <a
          href="https://www.google.com/maps/search/?api=1&query=Husholmsgatan+4+425+30+Hisings+Kärra"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-amber-50 transition-colors"
        >
          Husholmsgatan 4
          <br />
          425 30 Hisings Kärra
        </a>
      </div>
    </div>
  );
};

export default Footer;
