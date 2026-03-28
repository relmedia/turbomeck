import type { Metadata } from "next";
import { PrivacyContent } from "./PrivacyContent";

export const metadata: Metadata = {
  title: "Integritetspolicy | Turbomeck",
  description:
    "Så hanterar Turbomeck dina personuppgifter i enlighet med GDPR.",
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
