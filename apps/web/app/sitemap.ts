import type { MetadataRoute } from "next";

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
    }
  ];
}
