import ProductInteraction from "@/components/ProductInteractions";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import RichTextContent from "@/components/RichTextContent";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import Image from "next/image";
import { fetchCategories, fetchProduct } from "@/lib/api";
import { notFound, redirect } from "next/navigation";
import { categorySlug, productUrl } from "@/lib/utils";

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ slug: string }>;
}) => {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) return { title: "Produkt hittades inte" };
  return {
    title: product.name,
    description: product.shortDescription,
  };
};

const ProductPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ color: string; size: string }>;
}): Promise<React.ReactElement> => {
  const { slug } = await params;
  const { size, color } = await searchParams;

  const [product, categories] = await Promise.all([
    fetchProduct(slug),
    fetchCategories(),
  ]);
  if (!product) notFound();

  // Redirect legacy /products/123 URLs to slugged URL
  if (/^\d+$/.test(slug)) {
    redirect(productUrl(product.id, product.name));
  }

  const selectedSize = size || product.sizes[0];
  const selectedColor = color || product.colors[0];

  const firstCategoryId = product.categoryIds?.[0];
  const firstCategory = firstCategoryId
    ? categories.find((c) => c.id === firstCategoryId)
    : null;
  const breadcrumbItems = [
    { label: "Hem", href: "/" },
    { label: "Produkter", href: "/" },
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
    <div className="flex flex-col gap-4 mt-6">
      <div className="flex flex-col gap-4 lg:flex-row md:gap-12 mt-4">
      {/* IMAGE GALLERY */}
      <div className="w-full lg:w-5/12">
        <ProductImageGallery
          images={product.galleryImages ?? [product.images?.default || "/products/1g.png"]}
          alt={product.name}
        />
      </div>
      {/* DETAILS */}
      <div className="w-full lg:w-7/12 flex flex-col gap-4">
        <h1 className="text-2xl font-medium">{product.name}</h1>
        <Breadcrumb items={breadcrumbItems} className="text-sm" />
        <RichTextContent html={product.description} />
        <h2 className="text-2xl font-semibold">
          {product.price.toLocaleString("sv-SE", { maximumFractionDigits: 0 })}{" "}
          Kr
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
          Genom att klicka på Betala nu godkänner du våra{" "}
          <span className="underline hover:text-black">Villkor</span> och{" "}
          <span className="underline hover:text-black">Integritetspolicy</span>.
          Du godkänner att vi debiterar din valda betalningsmetod för det totala
          beloppet. Alla köp omfattas av vår retur- och{" "}
          <span className="underline hover:text-black">Återbetalningspolicy</span>.
        </p>
      </div>
    </div>
    </div>
  );
};

export default ProductPage;
