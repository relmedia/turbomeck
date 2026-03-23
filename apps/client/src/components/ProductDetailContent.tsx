"use client";

import { ProductType } from "@/types";
import ProductInteraction from "./ProductInteractions";
import {
  ProductReviewsProvider,
  ProductReviewsSummary,
  ProductReviewsSection,
} from "./ProductReviews";
import RichTextContent from "./RichTextContent";
import { Breadcrumb } from "./ui/breadcrumb";
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
    { label: t("product.products"), href: "/" },
    ...(firstCategory
      ? [
          {
            label: firstCategory.parentName
              ? `${firstCategory.parentName} › ${firstCategory.name}`
              : firstCategory.name,
            href: `/?category=${categorySlug(firstCategory)}`,
          },
        ]
      : []),
    { label: product.name },
  ];

  return (
    <ProductReviewsProvider productId={Number(product.id)}>
      <div className="w-full lg:w-7/12 flex flex-col gap-4">
        <Breadcrumb items={breadcrumbItems} className="text-sm" />
        <h1 className="text-2xl font-medium">{product.name}</h1>
        <ProductReviewsSummary />
        <RichTextContent html={product.description} />
        {isSweden && product.depositAmount != null && product.depositAmount > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
            <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
              {t("product.utbyteTitle")}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              {t("product.utbyteDescription")}
            </p>
          </div>
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
