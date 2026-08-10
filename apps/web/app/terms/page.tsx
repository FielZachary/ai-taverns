import type { Metadata } from "next";
import { TrustPage } from "@/components/TrustPage";
import { trustPageByPath } from "@/lib/trust-pages";

const page = trustPageByPath["/terms"];

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

export default function TermsPage() {
  return <TrustPage page={page} />;
}
