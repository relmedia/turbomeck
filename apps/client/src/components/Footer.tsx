"use client";

import Image from "next/image";
import Link from "next/link";
import { CookieTrigger } from "@/components/cookie-consent";
import { useTranslation } from "@/i18n/context";

const Footer = () => {
  const t = useTranslation();
  return (
    <footer className="mt-16 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Top: Logo + nav */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-6 border-b border-gray-200 dark:border-gray-700">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image src="/logo.svg" alt="Turbomeck" width={32} height={32} />
            <span className="text-base font-semibold tracking-wide text-gray-900 dark:text-white">
              TURBOMECK
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
            <Link href="/products" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              {t("footer.allProducts")}
            </Link>
            <a href="mailto:shop@turbomeck.se" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              {t("footer.contact")}
            </a>
          </nav>
        </div>

        {/* Bottom: Copyright + contact + legal */}
        <div className="flex flex-col gap-4 pt-6 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p>© {new Date().getFullYear()} Turbomeck. {t("footer.rightsReserved")}</p>
            <a href="tel:+46709165006" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              +46 709 16 50 06
            </a>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Husholmsgatan+4+425+30+Hisings+Kärra"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Husholmsgatan 4, 425 30 Hisings Kärra
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              {t("footer.privacy")}
            </Link>
            <Link href="/terms" className="hover:text-gray-900 dark:hover:text-white transition-colors">
              {t("footer.terms")}
            </Link>
            <CookieTrigger className="hover:text-gray-900 dark:hover:text-white transition-colors text-inherit cursor-pointer">
              {t("footer.cookieSettings")}
            </CookieTrigger>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
