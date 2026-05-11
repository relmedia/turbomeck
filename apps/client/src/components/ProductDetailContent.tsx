"use client";

import { Fragment } from "react";
import { ProductType } from "@/types";
import ProductInteraction from "./ProductInteractions";
import {
  ProductReviewsProvider,
  ProductReviewsSummary,
  ProductReviewsSection,
} from "./ProductReviews";
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
import { categorySlug } from "@/lib/utils";
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
};

export function ProductDetailContent({
  product,
  selectedSize,
  selectedColor,
  firstCategory,
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
    <ProductReviewsProvider productId={Number(product.id)}>
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
        <RichTextContent html={product.description} />
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
        <ProductReviewsSection />
      </div>
    </ProductReviewsProvider>
  );
}
