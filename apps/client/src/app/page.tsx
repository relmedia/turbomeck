import ProductList from "@/components/ProductList";
import { HomepageSlider } from "@/components/HomepageSlider";

const Homepage = async ({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; search?: string }>;
}) => {
  const { category, page, search } = await searchParams;

  return (
    <div className="">
      <HomepageSlider />
      <ProductList category={category} params="homepage" page={page} search={search} />
    </div>
  );
};

export default Homepage;
