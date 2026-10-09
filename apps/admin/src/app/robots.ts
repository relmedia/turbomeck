import type { MetadataRoute } from "next";

/**
 * studio.turbomeck.se is the admin app. It was crawlable — nothing here
 * should ever appear in a search result, and an indexed admin URL is both an
 * SEO liability for the storefront brand and an invitation to probe.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
