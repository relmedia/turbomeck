import ProductList from "@/components/ProductList";

const ProductsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; search?: string; sort?: string }>;
}) => {
  const { category, page, search, sort } = await searchParams;
  return (
    <div className="">
      <ProductList category={category} params="products" page={page} search={search} sort={sort} />
    </div>
  );
};

export default ProductsPage;
