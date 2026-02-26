"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import SearchBar from "./SearchBar";
import { Bell, Home, User } from "lucide-react";
import ShoppingCartIcon from "./ShoppingCartIcon";
import { useSession, signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { AuthModal } from "./AuthModal";

const Navbar = () => {
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  return (
    <nav className="w-full flex items-center justify-between border-b border-gray-200 pb-4">
      {/*LEFT*/}
      <Link href={"/"} className="flex items-center">
        <Image src="/logo.svg" alt="Turbomeck" width={35} height={35} />
        <p className="hidden md:block text-xl font-semibold tracking-wider italic lightGreen ms-2">
          TURBO
        </p>
        <p className="hidden md:block text-xl font-semibold text-gray-700 tracking-wider italic">
          MECK
        </p>
      </Link>
      {/*RIGHT*/}
      <div className="flex items-center gap-6">
        <SearchBar />
        <Link href="/">
          <Home className="w-4 h-4 text-gray-600" />
        </Link>
        <Bell className="w-4 h-4 text-gray-600" />
        <ShoppingCartIcon />
        {status !== "loading" && (
          <>
            {!session ? (
              <>
                <button
                  type="button"
                  className="text-sm cursor-pointer"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthOpen(true);
                  }}
                >
                  Logga in
                </button>
                <button
                  type="button"
                  className="text-sm cursor-pointer"
                  onClick={() => {
                    setAuthMode("register");
                    setAuthOpen(true);
                  }}
                >
                  Skapa konto
                </button>
                <AuthModal
                  open={authOpen}
                  onOpenChange={setAuthOpen}
                  defaultMode={authMode}
                />
              </>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <User className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/account">
                      <User className="w-4 h-4 mr-2" />
                      Mitt konto
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                    Logga ut
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
