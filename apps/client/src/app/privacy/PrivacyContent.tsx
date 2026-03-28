"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLanguage, useTranslation } from "@/i18n/context";

const CONTACT_MAIL = "shop@turbomeck.se";

export function PrivacyContent() {
  const t = useTranslation();
  const { locale } = useLanguage();

  useEffect(() => {
    document.title =
      locale === "en"
        ? "Privacy policy | Turbomeck"
        : "Integritetspolicy | Turbomeck";
  }, [locale]);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 px-4 py-2 mb-8 text-sm font-medium bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        {t("privacyPage.backLink")}
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        {t("privacyPage.title")}
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
        {t("privacyPage.introBefore")}
        <a href={`mailto:${CONTACT_MAIL}`} className="underline hover:text-foreground">
          {t("privacyPage.contactLink")}
        </a>
        {t("privacyPage.introAfter")}
      </p>

      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-8">
        {t("privacyPage.updated")}
      </h2>

      <div className="space-y-8 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("privacyPage.s1Title")}
          </h2>
          <p>{t("privacyPage.s1p1")}</p>
          <p>
            Turbomeck
            <br />
            Husholmsgatan 4
            <br />
            425 30 Hisings Kärra
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("privacyPage.s2Title")}
          </h2>
          <p>{t("privacyPage.s2Intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("privacyPage.s2li1")}</li>
            <li>{t("privacyPage.s2li2")}</li>
            <li>{t("privacyPage.s2li3")}</li>
            <li>{t("privacyPage.s2li4")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("privacyPage.s3Title")}</h2>
          <p>{t("privacyPage.s3Intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("privacyPage.s3li1")}</li>
            <li>{t("privacyPage.s3li2")}</li>
            <li>{t("privacyPage.s3li3")}</li>
            <li>{t("privacyPage.s3li4")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("privacyPage.s4Title")}
          </h2>
          <p>{t("privacyPage.s4p1")}</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("privacyPage.s5Title")}
          </h2>
          <p>{t("privacyPage.s5p1")}</p>
          <p className="font-medium mt-4">{t("privacyPage.s5sub")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("privacyPage.s5li1")}</li>
            <li>{t("privacyPage.s5li2")}</li>
            <li>{t("privacyPage.s5li3")}</li>
            <li>{t("privacyPage.s5li4")}</li>
          </ul>
          <p className="mt-2">{t("privacyPage.s5p2")}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">{t("privacyPage.s6Title")}</h2>
          <p>{t("privacyPage.s6Intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("privacyPage.s6li1")}</li>
            <li>{t("privacyPage.s6li2")}</li>
            <li>{t("privacyPage.s6li3")}</li>
            <li>
              {t("privacyPage.s6li4Before")}
              <Link href="/account/export" className="underline hover:text-foreground">
                {t("privacyPage.s6li4Link")}
              </Link>
              {t("privacyPage.s6li4After")}
            </li>
            <li>{t("privacyPage.s6li5")}</li>
          </ul>
          <p>{t("privacyPage.s6contact")}</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
            {t("privacyPage.s7Title")}
          </h2>
          <p>{t("privacyPage.s7p1")}</p>
        </section>
      </div>
    </div>
  );
}
