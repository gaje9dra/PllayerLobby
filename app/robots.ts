import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/dashboard/",
        "/profile/",
        "/login/",
        "/payment/",
        "/access-denied/",
        "/tournaments/*/join/",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
  };
}
