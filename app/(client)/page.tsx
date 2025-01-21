import Container from "@/components/Container";
import DiscountBanner from "@/components/DiscountBanner";
import HeroSlide from "@/components/HeroSlide";
//import HomeBanner from "@/components/HomeBanner";
import ProductGrid from "@/components/ProductGrid";

export default function Home() {
  return (
    <Container className="py-10">
      <HeroSlide />
      <DiscountBanner sales={[]} />
      {/* <HomeBanner /> */}
      <ProductGrid />
    </Container>
  );
}
