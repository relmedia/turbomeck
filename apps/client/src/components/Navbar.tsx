"use client";

import Image from "next/image";
import Link from "next/link";
import SearchBar from "./SearchBar";
import { Bell, Home, User } from "lucide-react";
import ShoppingCartIcon from "./ShoppingCartIcon";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  useAuth,
  UserButton,
} from "@clerk/nextjs";

const Navbar = () => {
  const { isLoaded } = useAuth();
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
        {isLoaded && (
          <>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-sm cursor-pointer">Logga in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="text-sm cursor-pointer">Skapa konto</button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/">
                <UserButton.MenuItems>
                  <UserButton.Link
                    label="Mitt konto"
                    labelIcon={<User className="w-4 h-4" />}
                    href="/account"
                  />
                </UserButton.MenuItems>
              </UserButton>
            </SignedIn>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
