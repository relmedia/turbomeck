"use client";

import { useEffect, useState } from "react";
import { htmlToText } from "@/lib/html-text";

type RichTextContentProps = {
  html: string;
  className?: string;
};

const PROSE_CLASSES =
  "text-gray-500 [&_p]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2 [&_li]:mb-1 [&_a]:text-gray-700 [&_a]:underline hover:[&_a]:text-gray-900";

/**
 * Renders admin-authored rich text, sanitized against XSS.
 *
 * The sanitizer is loaded lazily, in the browser only, and that is load-
 * bearing rather than an optimisation: @repo/sanitize-html's server entry
 * pulls in `isomorphic-dompurify` -> jsdom, and jsdom reads its default
 * stylesheet off disk at *module evaluation* time. Bundled by webpack that
 * path is rewritten into the build output directory and throws
 * `ENOENT .next/dev/browser/default-stylesheet.css`. A static import here was
 * therefore enough to fail the entire server render of any page containing a
 * product description — React caught it and silently fell back to client
 * rendering, which is why the product page used to ship no indexable HTML at
 * all. (jsdom cannot simply be externalised: under pnpm it is a dependency of
 * @repo/sanitize-html and is not resolvable from this app at runtime.)
 *
 * So the server renders the field's text content, and once mounted we replace
 * it with the sanitized markup. Same words either way — crawlers and
 * no-JS visitors get the prose, everyone else also gets the formatting.
 */
export default function RichTextContent({ html, className = "" }: RichTextContentProps) {
  const [sanitized, setSanitized] = useState<string | null>(null);

  useEffect(() => {
    if (!html || html.trim() === "") return;
    let cancelled = false;
    import("@repo/sanitize-html")
      .then(({ sanitizeRichTextHtml }) => {
        if (!cancelled) setSanitized(sanitizeRichTextHtml(html));
      })
      .catch((e) => {
        // Leave the plain-text rendering in place: it is already safe, so a
        // chunk-load failure degrades formatting, never correctness.
        console.error("RichTextContent: sanitizer failed to load:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [html]);

  if (!html || html.trim() === "") return null;

  if (sanitized === null) {
    // Rendered as text, so React escapes it — markup in the field is inert
    // here and no sanitizer is needed for this branch.
    return (
      <div className={`${PROSE_CLASSES} ${className}`} suppressHydrationWarning>
        {htmlToText(html)}
      </div>
    );
  }

  return (
    <div
      className={`${PROSE_CLASSES} ${className}`}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
