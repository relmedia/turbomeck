"use client";
import { productType } from "@/constants";
interface Props {
  selectedTab: string;
  onTabSelect: (tab: string) => void;
}

const HomeTabbar = ({ selectedTab, onTabSelect }: Props) => {
  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold">
      <div className="flex flex-wrap items-center gap-1.5">
        {productType?.map((item) => (
          <button
            onClick={() => onTabSelect(item?.title)}
            key={item?.title}
            className={`border border-darkColor px-4 py-1.5 md:px-6 md:py-2 rounded-full hover:bg-darkColor hover:text-white flex-wrap hoverEffect ${selectedTab === item?.title && "bg-darkColor text-white"}`}>
            {item?.title}
          </button>
        ))}
      </div>
    </div>
  );
};

export default HomeTabbar;
