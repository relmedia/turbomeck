import Banner from "@/components/Banner";
import Container from "@/components/Container";
import HeroSlide from "@/components/HeroSlide";
import HomeBanner from "@/components/HomeBanner";
import ProductGrid from "@/components/ProductGrid";

export default function Home() {
  return (
    <Container className="py-10">
      {/* <HeroSlide /> */}
      <Banner />
      <HomeBanner />
      <ProductGrid />
    </Container>
  );
}
