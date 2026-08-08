import type { Metadata } from "next";
import { PublicSeoPage } from "@/components/PublicSeoPage";
import { publicSeoPageByPath } from "@/lib/public-seo-pages";

const page = publicSeoPageByPath["/tabletop-rpg-ai"];

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

export default function TabletopRpgAiPage() {
  return <PublicSeoPage page={page} />;
}
