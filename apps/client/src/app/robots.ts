import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site";

/**
 * Served at /robots.txt.
 *
 * The disallow list is every route that is either private (account, orders),
 * transactional (cart, checkout), or an authentication surface. None of them
 * can rank, and crawling them burns budget that belongs to product pages.
 *
 * `/products` itself stays crawlable — only its facet combinations are kept
 * out, via the canonical tag on that page rather than a Disallow, so link
 * equity from a shared filtered URL still flows to the bare listing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/account",
          "/cart",
          "/logga-in",
          "/order/",
          "/reset-password",
          "/user-profile",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
