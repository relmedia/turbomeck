import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { WishlistProvider } from "@/components/providers/WishlistProvider";
import { LanguageProvider } from "@/i18n/context";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProvider>
          <LanguageProvider>
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
            <div className="mx-auto max-w-screen-xl px-4 pb-6 pt-3 sm:p-4 sm:pb-6">
              <Navbar />
              {children}
              <Footer />
            </div>
            <CookieBanner />
            <CookieSettings />
            <ToastContainer position="top-right" />
          </CookieConsentProvider>
          </WishlistProvider>
          </LanguageProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
