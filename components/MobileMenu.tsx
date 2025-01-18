"use client";

import { AlignLeft } from "lucide-react";
import { useState } from "react";

import { CATEGORIES_QUERYResult } from "@/sanity.types";
import Sidebar from "./Sidebar";

const MobileMenu = ({ categories }: { categories: CATEGORIES_QUERYResult }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };
  return (
    <>
      <button onClick={toggleSidebar}>
        <AlignLeft className="w-6 h-6 hover:text-hoverColor hoverEffect md:hidden" />
      </button>
      <div className="md:hidden">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          categories={categories}
        />
      </div>
    </>
  );
};

export default MobileMenu;
