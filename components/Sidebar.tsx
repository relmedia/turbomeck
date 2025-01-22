import React, { FC } from "react";
import { motion } from "motion/react";
import Logo from "./Logo";
import { headerData } from "@/constants";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import SocialMedia from "./SocialMedia";
import { useOutsideClick } from "@/hooks/useOutsideClick";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: FC<SidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const sidebarRef = useOutsideClick<HTMLDivElement>(onClose);
  return (
    <div
      className={`fixed inset-y-0 left-0 z-50 bg-black/50 shadow-xl hoverEffect cursor-auto w-full ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        ref={sidebarRef}
        className="min-w-72 max-w-96 bg-black/95 text-white/70 h-full p-10 border-r border-r-white/20 flex flex-col gap-7">
        <div className="flex items-center justify-between">
          <button onClick={onClose}>
            <Logo>
              Turbo<p className="text-white items-center">meck</p>
            </Logo>
          </button>
          <button className="hover:text-red-500 hoverEffect" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="flex flex-col gap-4 text-base font-semibold tracking-wide">
          {headerData?.map((Item) => (
            <Link
              onClick={onClose}
              key={Item?.title}
              href={Item?.href}
              className={`hover:text-white hoverEffect w-32 ${pathname === Item?.href && "text-white"}`}>
              {Item?.title}
            </Link>
          ))}
        </div>
        <SocialMedia />
      </motion.div>
    </div>
  );
};

export default Sidebar;
