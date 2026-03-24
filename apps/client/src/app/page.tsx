import ProductList from "@/components/ProductList";
import { HomepageSlider } from "@/components/HomepageSlider";

const Homepage = async ({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; search?: string }>;
}) => {
  const { category, page, search } = await searchParams;
  const isStartPage = !category && !search;

  return (
    <div className="">
      {isStartPage && <HomepageSlider />}
      <ProductList category={category} params="homepage" page={page} search={search} />
    </div>
  );
};

export default Homepage;
