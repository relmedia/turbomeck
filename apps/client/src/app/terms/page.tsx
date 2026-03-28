import type { Metadata } from "next";
import { TermsContent } from "./TermsContent";

export const metadata: Metadata = {
  title: "Köpvillkor | Turbomeck",
  description: "Allmänna villkor för köp hos Turbomeck.",
};

export default function VillkorPage() {
  return <TermsContent />;
}
