"use client";

import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import Navbar from "@/components/Navbar";
import { cn } from "@/lib/utils";

export function StudioHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-background/80 px-4 backdrop-blur-md transition-[width,height,border-radius] ease-linear lg:px-6",
        scrolled ? "rounded-none" : "rounded-t-xl"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-1 lg:gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-2 h-4" />
        </div>
        <Navbar />
      </div>
    </header>
  );
}
