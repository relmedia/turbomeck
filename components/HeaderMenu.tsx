"use client";
import { CATEGORIES_QUERYResult, Category } from "@/sanity.types";
import Link from "next/link";
import { usePathname } from "next/navigation";

const HeaderMenu = ({ categories }: { categories: CATEGORIES_QUERYResult }) => {
  const pathname = usePathname();

  return (
    <div className="hidden lg:inline-flex w-auto items-center gap-5 text-sm capitalize font-semibold text-lightColor">
      <Link
        href={"/"}
        className={`hover:text-lightGreen hoverEffect relative group ${pathname === "/" && "text-lightGreen"}`}>
        Start
        <span
          className={`absolute -bottom-0.5 left-1/2 w-0 h-0.5 bg-lightGreen transition-all duration-300 group-hover:w-1/2 group-hover:left-0 ${
            pathname === "/" && "w-1/2"
          }`}
        />
        <span
          className={`absolute -bottom-0.5 right-1/2 w-0 h-0.5 bg-lightGreen transition-all duration-300 group-hover:w-1/2 group-hover:right-0 ${
            pathname === "/" && "w-1/2"
          }`}
        />
      </Link>
      {categories?.map((category: Category) => (
        <Link
          key={category?._id}
          href={`/category/${category?.slug?.current}`}
          className={`hover:text-lightGreen hoverEffect relative group ${pathname === `/category/${category?.slug?.current}` && "text-lightGreen"}`}>
          {category?.title}
          <span
            className={`absolute -bottom-0.5 left-1/2 w-0 h-0.5 bg-lightGreen transition-all duration-300 group-hover:w-1/2 group-hover:left-0 ${
              pathname === `/category/${category?.slug?.current}` && "w-1/2"
            }`}
          />
          <span
            className={`absolute -bottom-0.5 right-1/2 w-0 h-0.5 bg-lightGreen transition-all duration-300 group-hover:w-1/2 group-hover:right-0 ${
              pathname === `/category/${category?.slug?.current}` && "w-1/2"
            }`}
          />
        </Link>
      ))}
    </div>
  );
};

export default HeaderMenu;
