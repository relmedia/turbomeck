import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { svSE } from "@clerk/localizations";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
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
    <ClerkProvider localization={svSE}>
      <html lang="sv">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <div className="max-w-screen-xl mx-auto p-4">
            <Navbar />
            {children}
            <Footer />
          </div>
          <ToastContainer position="top-right" />
        </body>
      </html>
    </ClerkProvider>
  );
}
