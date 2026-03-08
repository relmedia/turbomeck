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
                {
                  key: "necessary",
                  title: "Nödvändiga",
                  description:
                    "Väsentliga cookies som behövs för att webbplatsen ska fungera. Dessa kan inte stängas av.",
                  required: true,
                },
                {
                  key: "analytics",
                  title: "Analys",
                  description:
                    "Cookies som hjälper oss förstå hur besökare använder webbplatsen.",
                },
                {
                  key: "marketing",
                  title: "Marknadsföring",
                  description:
                    "Cookies för reklam och spårning över webbplatser.",
                },
                {
                  key: "preferences",
                  title: "Inställningar",
                  description: "Cookies som sparar dina val och preferenser.",
                },
              ],
            }}
          >
            <div className="max-w-screen-xl mx-auto p-4">
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
