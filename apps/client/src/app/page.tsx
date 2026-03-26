import { cookies } from "next/headers";
import ProductList from "@/components/ProductList";
import { HomepageSlider } from "@/components/HomepageSlider";
import { fetchSliderProducts } from "@/lib/api";
import { LOCALE_COOKIE_NAME, type Locale } from "@/i18n/context";

const Homepage = async ({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; search?: string }>;
}) => {
  const { category, page, search } = await searchParams;
  const isStartPage = !category && !search;

  let sliderProducts = [] as Awaited<ReturnType<typeof fetchSliderProducts>>;
  if (isStartPage) {
    try {
      const cookieStore = await cookies();
      const locale = (cookieStore.get(LOCALE_COOKIE_NAME)?.value as Locale) || "sv";
      sliderProducts = await fetchSliderProducts(locale);
    } catch (e) {
      console.error("Homepage slider SSR fetch failed:", e);
    }
  }

  return (
    <div className="">
      {isStartPage && <HomepageSlider initialProducts={sliderProducts} />}
      <ProductList category={category} params="homepage" page={page} search={search} />
    </div>
  );
};

export default Homepage;
