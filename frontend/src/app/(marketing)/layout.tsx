import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TaxScape Pro | R&D Tax Credit Solutions",
  description:
    "Maximize your R&D tax credits with AI-powered auditing. IRS-compliant documentation, automated calculations, and expert guidance.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

