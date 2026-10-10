import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { WishlistProvider } from "@/components/providers/WishlistProvider";
import { LanguageProvider } from "@/i18n/context";
import { CurrencyProvider } from "@/components/providers/CurrencyProvider";
import { resolveDisplayCurrency } from "@/lib/display-currency";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { OrganizationJsonLd } from "@/components/seo/JsonLd";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CompareBar } from "@/components/compare/CompareBar";
import {
  CookieConsentProvider,
  CookieBanner,
  CookieSettings,
} from "@/components/cookie-consent";
import { VisitTracker } from "@/components/VisitTracker";
import { ToastContainer } from "react-toastify";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "Turbomeck är en svensk webshop som specialiserar sig på högpresterande turbodelar och avgassystem för bilar — allt från kompressorhjul och turbinaxlar till downpipes, intercoolers, dumpventiler och mätare.";

export const metadata: Metadata = {
  // Required for `alternates.canonical` and openGraph image paths to resolve
  // to absolute URLs. Without it Next emits relative canonicals, which Google
  // resolves against the request host — so a request to any other hostname
  // would self-canonicalise instead of pointing at the apex.
  metadataBase: new URL(SITE_URL),
  title: {
    // `default` is used verbatim; `template` wraps every page-level title, so
    // routes only declare their own subject and still get the brand suffix.
    default: "Turbomeck – Allt från turbo till avgassystem",
    template: "%s | Turbomeck",
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: SITE_NAME,
    url: "/",
    title: "Turbomeck – Allt från turbo till avgassystem",
    description: SITE_DESCRIPTION,
    images: [{ url: "/logo.png", width: 512, height: 512, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Turbomeck – Allt från turbo till avgassystem",
    description: SITE_DESCRIPTION,
    images: ["/logo.png"],
  },
  // Swedish is the only indexable locale; the en translation is a cookie-based
  // UI convenience with no URL of its own, so there is nothing to pair with
  // hreflang and no alternate to declare.
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved on the server so the first paint already shows local prices —
  // no flash of SEK, and the visitor's IP never leaves our backend.
  const display = await resolveDisplayCurrency();

  return (
    <html lang="sv" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Site-wide entity markup. Emitted once here rather than per page so
            there is a single Organization node for Google to attach the brand,
            logo and contact details to. */}
        <OrganizationJsonLd />
        <SessionProvider>
          <LanguageProvider>
          <CurrencyProvider
            currency={display.currency}
            rate={display.rate}
            source={display.source}
          >
          <WishlistProvider>
          <CookieConsentProvider
            config={{
              consentVersion: "1.0.0",
              privacyPolicyUrl: "/privacy",
              position: "bottom",
              categories: [
                { key: "necessary", required: true },
                { key: "analytics" },
                { key: "marketing" },
                { key: "preferences" },
              ],
            }}
          >
            <VisitTracker />
            <div className="mx-auto max-w-[1600px] px-4 pb-6 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
              <Navbar />
              {children}
              <Footer />
              {/* Docked here rather than per page so a comparison survives
                  navigation: pick one product on the homepage, another from a
                  category, and both are still queued. Renders nothing when the
                  list is empty. */}
              <CompareBar />
            </div>
            <CookieBanner />
            <CookieSettings />
            {/* No close button, and the whole toast is the dismiss target.
                `closeOnClick` defaults to false in react-toastify v11, so it
                has to be set explicitly. Both are container-level defaults and
                no `toast.*()` call overrides them. */}
            <ToastContainer
              position="top-right"
              closeButton={false}
              closeOnClick
            />
          </CookieConsentProvider>
          </WishlistProvider>
          </CurrencyProvider>
          </LanguageProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
