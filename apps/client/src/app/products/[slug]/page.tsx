import { ProductPageClient } from "@/components/ProductPageClient";
import { fetchProduct } from "@/lib/api";

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

  return (
    <ProductPageClient
      slug={slug}
      size={size}
      color={color}
    />
  );
};

export default ProductPage;
