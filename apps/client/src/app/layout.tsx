import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { WishlistProvider } from "@/components/providers/WishlistProvider";
import { LanguageProvider } from "@/i18n/context";
import { CurrencyProvider } from "@/components/providers/CurrencyProvider";
import { resolveDisplayCurrency } from "@/lib/display-currency";
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

export const metadata: Metadata = {
  title: "Turbomeck - Allt från turbo till avgassystem",
  description:
    "Turbomeck är en svensk webshop som specialiserar sig på högpresterande turbodelar och avgassystem för bilar — allt från kompressorhjul och turbinaxlar till downpipes, intercoolers, dumpventiler och mätare.",
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
            <ToastContainer position="top-right" />
          </CookieConsentProvider>
          </WishlistProvider>
          </CurrencyProvider>
          </LanguageProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
