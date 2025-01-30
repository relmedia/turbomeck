import React from "react";
import Title from "./Title";

const HomeBanner = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-5 pt-16">
      <Title className="uppercase text-3xl md:text-4xl font-bold text-center">
        Hitta dina turbodelar
      </Title>
      <p className="text-md text-center text-lightColor/80 font-medium max-w-[480px] ">
        Vi har 40 års erfarenhet av utbytesturbo! Vi erbjuder nya och renoverade
        turbosystem med fabriksstandard. Vi kan också hjälpa dig att renovera
        din gamla.
      </p>
    </div>
  );
};

export default HomeBanner;
