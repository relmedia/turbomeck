import type { Metadata } from "next";
import ProductList from "@/components/ProductList";

/**
 * Canonical is the bare /products on purpose. The page accepts category, page,
 * sort, minPrice, maxPrice, inStock and utbytes, so the facet space is
 * combinatorial; pointing every combination at one URL consolidates them
 * instead of asking Google to crawl and rank near-duplicates.
 */
export const metadata: Metadata = {
  title: "Alla produkter",
  description:
    "Hela Turbomecks sortiment av turbodelar och avgassystem — turboaggregat, kompressorhjul, downpipes, intercoolers, dumpventiler och mätare. Filtrera på bilmärke, pris och lagerstatus.",
  alternates: { canonical: "/products" },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: "/products",
    title: "Alla produkter | Turbomeck",
    description:
      "Hela Turbomecks sortiment av turbodelar och avgassystem. Filtrera på bilmärke, pris och lagerstatus.",
  },
};

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
      {/* The listing had no h1 at all. Visually hidden because the toolbar and
          filter rail already carry the page's visible structure — adding a
          display heading here would be a design change, not an SEO fix. */}
      <h1 className="sr-only">
        {search ? `Sökresultat för ”${search}”` : "Alla produkter"}
      </h1>
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
