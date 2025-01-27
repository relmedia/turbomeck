import AddToCartButton from "@/components/AddToCartButton";
import Container from "@/components/Container";
import ImageView from "@/components/ImageView";
import PriceView from "@/components/PriceView";
import ProductCharacteristics from "@/components/ProductCharacteristics";
import { getProductBySlug } from "@/sanity/helpers";
//import { Heart } from "lucide-react";
import { PortableText } from "next-sanity";
import { notFound } from "next/navigation";
import React from "react";
//import { FaRegQuestionCircle } from "react-icons/fa";
//import { FiShare2 } from "react-icons/fi";
//import { RxBorderSplit } from "react-icons/rx";
//import { TbTruckDelivery } from "react-icons/tb";

const ProductPage = async ({
  params,
}: {
  params: Promise<{ slug: string }>;
}) => {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return notFound();
  }

  return (
    <div>
      <Container className="flex flex-col md:flex-row gap-10 py-10">
        {product?.images && <ImageView images={product?.images} />}
        <div className="w-full md:w-1/2 flex flex-col gap-5">
          <div>
            <p className="text-4xl font-bold mb-2">{product?.name}</p>
            <PriceView
              price={product?.price}
              discount={product?.discount}
              className="text-lg font-bold"
            />
          </div>
          {product?.stock && (
            <p className="bg-green-100 w-24 text-center text-green-600 text-sm py-2.5 font-semibold rounded-lg">
              I Lager
            </p>
          )}

          <div className="text-md text-gray-600 tracking-wide">
            {Array.isArray(product?.description) && (
              <PortableText value={product?.description} />
            )}
          </div>
          <div className="flex items-center gap-2.5 lg:gap-5">
            <AddToCartButton
              product={product}
              className="bg-darkColor/80 text-white hover:bg-darkColor hoverEffect"
            />
            {/* <button className="border-2 border-darkColor/30 text-darkColor/60 px-2.5 py-1.5 rounded-md hover:text-darkColor hover:border-darkColor hoverEffect">
              <Heart className="w-5 h-5" />
            </button> */}
          </div>
          <ProductCharacteristics product={product} />
          {/* <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-b-gray-200 py-5 -mt-2">
            <div className="flex items-center gap-2 text-sm text-black hover:text-red-600 hoverEffect">
              <RxBorderSplit className="text-lg" />
              <p>Compare color</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-black hover:text-red-600 hoverEffect">
              <FaRegQuestionCircle className="text-lg" />
              <p>Ask a question</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-black hover:text-red-600 hoverEffect">
              <TbTruckDelivery className="text-lg" />
              <p>Delivery & Return</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-black hover:text-red-600 hoverEffect">
              <FiShare2 className="text-lg" />
              <p>Share</p>
            </div>
          </div> */}
          <div className="flex flex-wrap items-center gap-5">
            <div className="border border-darkBlue/20 text-center p-3 hover:border-darkBlue hoverEffect rounded-md">
              <p className="text-base font-semibold text-black">
                Flexibel Betalning
              </p>
              <p className="text-sm text-gray-500">
                Betala med kort eller dela upp din betalning
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default ProductPage;
