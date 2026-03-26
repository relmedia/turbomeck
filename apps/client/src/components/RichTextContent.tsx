"use client";

import { sanitizeRichTextHtml } from "@repo/sanitize-html";

type RichTextContentProps = {
  html: string;
  className?: string;
};

/**
 * Safely renders HTML content (e.g. from WYSIWYG editor) with XSS sanitization.
 * Syncs with admin product description field.
 */
export default function RichTextContent({ html, className = "" }: RichTextContentProps) {
  if (!html || html.trim() === "") return null;

  const sanitized = sanitizeRichTextHtml(html);

  return (
    <div
      className={`text-gray-500 [&_p]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2 [&_li]:mb-1 [&_a]:text-gray-700 [&_a]:underline hover:[&_a]:text-gray-900 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
