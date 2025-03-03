import Container from "@/components/Container";
import FooterTop from "@/components/FooterTop";
import HeroSlide from "@/components/HeroSlide";
import HomeBanner from "@/components/HomeBanner";
import ProductGrid from "@/components/ProductGrid";

export default function Home() {
  return (
    <Container className="py-10">
      {/* <HeroSlide /> */}
      <HeroSlide />
      <FooterTop />
      <HomeBanner />
      <ProductGrid />
    </Container>
  );
}
