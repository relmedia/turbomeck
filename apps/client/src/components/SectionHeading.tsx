"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "@/i18n/context";

/**
 * Landing-page section header: eyebrow, title, optional lead and side link.
 *
 * Shared so the page's sections keep one rhythm instead of each inventing its
 * own spacing and type scale. The treatment comes from the hero — black
 * uppercase italic headline, green rule as the eyebrow marker — at a smaller
 * size, so sections read as subordinate to the hero rather than competing.
 *
 * Props are **translation keys**, not strings: translations live in a client
 * context, so a server component (like `app/page.tsx`) cannot resolve them
 * before rendering. Taking keys lets server pages use this directly.
 */

const GREEN = "rgb(110, 201, 0)";

export function SectionHeading({
  eyebrow,
  title,
  lead,
  linkLabel,
  linkHref,
  className,
}: {
  /** i18n key, e.g. "landing.browseEyebrow" */
  eyebrow: string;
  /** i18n key */
  title: string;
  /** i18n key */
  lead?: string;
  /** i18n key */
  linkLabel?: string;
  linkHref?: string;
  className?: string;
}) {
  const t = useTranslation();

  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className ?? "mb-5"}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span
            className="block h-[3px] w-6 shrink-0"
            style={{ backgroundColor: GREEN }}
            aria-hidden
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
            {t(eyebrow)}
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-black uppercase italic leading-none tracking-tight text-gray-900 md:text-3xl">
          {t(title)}
        </h2>
        {lead && (
          <p className="mt-2 max-w-md text-xs italic leading-relaxed text-gray-500 md:text-sm">
            {t(lead)}
          </p>
        )}
      </div>

      {linkLabel && linkHref && (
        <Link
          href={linkHref}
          className="group/seeall inline-flex items-center gap-1.5 whitespace-nowrap border-b border-gray-300 pb-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-900 transition-colors hover:border-gray-900"
        >
          {t(linkLabel)}
          <ArrowRight
            className="size-3.5 transition-transform duration-300 group-hover/seeall:translate-x-1"
            strokeWidth={2.5}
            aria-hidden
          />
        </Link>
      )}
    </div>
  );
}
