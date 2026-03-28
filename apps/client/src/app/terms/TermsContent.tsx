"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLanguage, useTranslation } from "@/i18n/context";

const CONTACT_MAIL = "shop@turbomeck.se";

export function TermsContent() {
  const t = useTranslation();
  const { locale } = useLanguage();

  useEffect(() => {
    document.title =
      locale === "en" ? "Terms of sale | Turbomeck" : "Köpvillkor | Turbomeck";
  }, [locale]);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 px-4 py-2 mb-8 text-sm font-medium bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        {t("termsPage.backLink")}
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        {t("termsPage.title")}
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
        {t("termsPage.introBefore")}
        <a href={`mailto:${CONTACT_MAIL}`} className="underline hover:text-foreground">
          {CONTACT_MAIL}
        </a>
        {t("termsPage.introAfter")}
      </p>

      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-8">
        {t("termsPage.updated")}
      </h2>

      <div className="space-y-8 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("termsPage.s1Title")}
          </h2>
          <p>{t("termsPage.s1p1")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("termsPage.s2Title")}</h2>
          <p>{t("termsPage.s2p1")}</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("termsPage.s3Title")}
          </h2>
          <p>{t("termsPage.s3p1")}</p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li>{t("termsPage.s3li1")}</li>
            <li>{t("termsPage.s3li2")}</li>
            <li>{t("termsPage.s3li3")}</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">{t("termsPage.s3footer")}</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("termsPage.s4Title")}
          </h2>
          <p>{t("termsPage.s4p1")}</p>
          <p className="mt-2">{t("termsPage.s4p2")}</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("termsPage.s5Title")}
          </h2>
          <p>{t("termsPage.s5p1")}</p>
          <p className="mt-2">{t("termsPage.s5p2")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("termsPage.s6Title")}</h2>
          <p>{t("termsPage.s6p1")}</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("termsPage.s7Title")}
          </h2>
          <p>{t("termsPage.s7p1")}</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("termsPage.s8Title")}
          </h2>
          <p>{t("termsPage.s8p1")}</p>
        </section>
      </div>
    </div>
  );
}
