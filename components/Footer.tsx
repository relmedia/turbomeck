import React from "react";
import Container from "./Container";
import Logo from "./Logo";
import SocialMedia from "./SocialMedia";
import { Input } from "./ui/input";
import { categoriesData, quickLinksData } from "@/constants";
import Link from "next/link";

const Footer = () => {
  return (
    <footer className="bg-white border-t ">
      <Container>
        <div className="py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-4 ">
            <Logo>
              Turbo<p className="text-neutral-800 items-center">meck</p>
            </Logo>
            <p className="mt-4 text-gray-600 text-sm">
              Lorem ipsum dolor sit amet, consectetur adipisicing elit. Ipsum
              autem facilis repudiandae veritatis enim.
            </p>
            <SocialMedia
              className="text-neutral-800/60"
              iconClassName="border-neutral-800/60 hover:border-neutral-800 hover:text-neutral-800"
              tooltipClassName="bg-neutral-800 text-white"
            />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-800 mb-4">
              Snabb länkar
            </h3>
            <div className="flex flex-col gap-3">
              {quickLinksData?.map((item) => (
                <Link
                  key={item?.title}
                  href={item?.href}
                  className="text-gray-600 hover:text-neutral-800 text-sm font-medium hoverEffect">
                  {item?.title}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-neutral-800 mb-4">Kategorier</h3>
            <div className="flex flex-col gap-3">
              {categoriesData?.map((item) => (
                <Link
                  key={item?.title}
                  href={`${item?.href}`}
                  className="text-gray-600 hover:text-neutral-800 text-sm font-medium hoverEffect">
                  {item?.title}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-neutral-800 mb-4">Nyhetsbrev</h3>
            <p className="text-gray-600 text-sm mb-4">
              Prenumerera på vårt nyhetsbrev för att få uppdateringar och
              exklusiva erbjudanden.
            </p>
            <form className="space-y-3">
              <Input
                type="email"
                placeholder="Fyll i din e-postadress"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <button
                type="submit"
                className="w-full bg-neutral-800 text-white px-4 py-2 rounded-lg hover:bg-neutral-900 transition-colors">
                Prenumerera
              </button>
            </form>
          </div>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
