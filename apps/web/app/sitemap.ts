import type { MetadataRoute } from "next";
import { publicSeoPages } from "@/lib/public-seo-pages";
import { trustPages } from "@/lib/trust-pages";

const siteUrl = (process.env.AUTH_PUBLIC_APP_ORIGIN ?? "https://aitaverns.com").replace(
  /\/$/,
  ""
);

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1
    },
    ...[...publicSeoPages, ...trustPages].map((page) => ({
      url: `${siteUrl}${page.path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7
    }))
  ];
}
