import type { Metadata } from "next";
import { TrustPage } from "@/components/TrustPage";
import { trustPageByPath } from "@/lib/trust-pages";

const page = trustPageByPath["/privacy"];

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: {
    canonical: page.path
  },
  openGraph: {
    title: page.title,
    description: page.description,
    url: page.path
  }
};

export default function PrivacyPage() {
  return <TrustPage page={page} />;
}
