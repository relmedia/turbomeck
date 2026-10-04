"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ProductType } from "@/types";
import ProductInteraction from "./ProductInteractions";
import { ProductReviewsSummary } from "./ProductReviews";
import RichTextContent from "./RichTextContent";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import Image from "next/image";
import Link from "next/link";
import { categorySlug, cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";
import { useGeoCountry } from "@/hooks/useGeoCountry";

type Category = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

type Props = {
  product: ProductType;
  selectedSize: string;
  selectedColor: string;
  firstCategory: Category | null;
  /** Opens the description tab below and scrolls to it. */
  onReadMore: () => void;
};

/**
 * Teaser of the product description: clamped to a few lines and faded out at the
 * bottom so the right column stays in line with the image gallery. The full text
 * lives in the tabbed section below the fold.
 */
function DescriptionTeaser({
  html,
  onReadMore,
}: {
  html: string;
  onReadMore: () => void;
}) {
  const t = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);

  // Only fade when the text actually overflows the clamp - a short description
  // should not get a cut-off look.
  useEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const measure = () => setClamped(content.scrollHeight - box.clientHeight > 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(box);
    return () => observer.disconnect();
  }, [html]);

  if (!html || html.trim() === "") return null;

  return (
    <div>
      <div
        ref={boxRef}
        className={cn(
          // Tuned so the payment badges land level with the gallery thumbnails.
          "max-h-52 overflow-hidden",
          clamped &&
            "[mask-image:linear-gradient(to_bottom,black_50%,transparent_100%)]"
        )}
      >
        <div ref={contentRef}>
          <RichTextContent html={html} />
      </div>
      </div>
      {clamped && (
        <button
          type="button"
          onClick={onReadMore}
          className="mt-1 w-fit cursor-pointer text-sm font-medium text-gray-700 underline underline-offset-2 hover:text-black"
        >
          {t("product.readMore")}
        </button>
      )}
    </div>
  );
}

export function ProductDetailContent({
  product,
  selectedSize,
  selectedColor,
  firstCategory,
  onReadMore,
}: Props) {
  const t = useTranslation();
  const { isSweden } = useGeoCountry();

  const breadcrumbItems = [
    { label: t("product.home"), href: "/" },
    { label: t("product.products"), href: "/products" },
    ...(firstCategory
      ? [
          {
            label: firstCategory.parentName
              ? `${firstCategory.parentName} › ${firstCategory.name}`
              : firstCategory.name,
            href: `/products?category=${categorySlug(firstCategory)}`,
          },
        ]
      : []),
    { label: product.name },
  ];

  return (
    <div className="w-full lg:w-7/12 flex flex-col gap-4">
      <Breadcrumb className="text-sm text-gray-500">
        <BreadcrumbList>
          {breadcrumbItems.map((item, i) => {
            const isLast = i === breadcrumbItems.length - 1;
            const hasHref = "href" in item && !!item.href;
            return (
              <Fragment key={i}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast || !hasHref ? (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={item.href!}>{item.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl font-medium">{product.name}</h1>
      <ProductReviewsSummary />
      <DescriptionTeaser html={product.description} onReadMore={onReadMore} />
      {isSweden && (
        <p className="text-sm text-muted-foreground">{t("product.coreExchangeCheckoutHint")}</p>
      )}
      <h2 className="text-2xl font-semibold">
        {product.price.toLocaleString("sv-SE", { maximumFractionDigits: 0 })}{" "}
        {t("common.kr")}
      </h2>
      <ProductInteraction
        product={product}
        selectedSize={selectedSize}
        selectedColor={selectedColor}
      />
      {/* CARD INFO */}
      <div className="flex items-center gap-2 mt-4">
        <Image
          src="/klarna.png"
          alt="klarna"
          width={50}
          height={25}
          className="rounded-md"
        />
        <Image
          src="/cards.png"
          alt="cards"
          width={50}
          height={25}
          className="rounded-md"
        />
        <Image
          src="/stripe.png"
          alt="stripe"
          width={50}
          height={25}
          className="rounded-md"
        />
        <Image
          src="/vipps.png"
          alt="vipps"
          width={50}
          height={25}
          className="rounded-md"
        />
      </div>
      <p className="text-gray-500 text-xs">
        {t("product.paymentDisclaimer")}{" "}
        <Link href="/terms" className="underline hover:text-black">{t("product.terms")}</Link>{" "}
        och{" "}
        <Link href="/privacy" className="underline hover:text-black">{t("product.privacy")}</Link>.
        {" "}{t("product.paymentDisclaimer2")}{" "}
        <Link href="/terms" className="underline hover:text-black">{t("product.refundPolicy")}</Link>.
      </p>
    </div>
  );
}
