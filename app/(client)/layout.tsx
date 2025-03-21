import type { Metadata } from "next";
import localFont from "next/font/local";
import "../globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { svSE } from "@clerk/localizations";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SanityLive } from "@/sanity/lib/live";
import { Toaster } from "react-hot-toast";
import { VisualEditing } from "next-sanity";
import { draftMode } from "next/headers";
import DisableDraftMode from "@/components/DisableDraftMode";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";

const poppins = localFont({
  src: "../fonts/Poppins.woff2",
  variable: "--font-poppins",
  weight: "100 900",
});
const raleway = localFont({
  src: "../fonts/Raleway.woff2",
  variable: "--font-raleway",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Turbomeck",
  description: "Allt från turbo till avgassystem",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider localization={svSE}>
      <html lang="sv">
        <body className={`${poppins.variable} ${raleway.variable} antialiased`}>
          {(await draftMode()).isEnabled && (
            <>
              <DisableDraftMode />
              <VisualEditing />
            </>
          )}
          <Header />
          {children}
          <Footer />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#2b2b2b",
                color: "#fff",
              },
            }}
          />
          <Analytics />
          <SpeedInsights />
          <SanityLive />
          {/* <Chat pageId="106453562488245" appId="560672463472073" />
    <ChatIcon /> */}
        </body>
      </html>
    </ClerkProvider>
  );
}
