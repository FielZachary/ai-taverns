import type { MetadataRoute } from "next";

const siteUrl = (process.env.AUTH_PUBLIC_APP_ORIGIN ?? "https://aitaverns.com").replace(
  /\/$/,
  ""
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/debug/"]
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  };
}
