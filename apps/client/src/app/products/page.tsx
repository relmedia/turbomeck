import ProductList from "@/components/ProductList";

const ProductsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    page?: string;
    search?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
    inStock?: string;
    utbytes?: string;
  }>;
}) => {
  const { category, page, search, sort, minPrice, maxPrice, inStock, utbytes } =
    await searchParams;
  return (
    <div className="">
      <ProductList
        category={category}
        params="products"
        page={page}
        search={search}
        sort={sort}
        minPrice={minPrice}
        maxPrice={maxPrice}
        inStock={inStock}
        utbytes={utbytes}
      />
    </div>
  );
};

export default ProductsPage;
