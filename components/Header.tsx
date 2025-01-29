import React from "react";
import HeaderMenu from "./HeaderMenu";
import Logo from "./Logo";
import Container from "./Container";
import CartIcon from "./CartIcon";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ClerkLoaded, SignedIn, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { getAllCategories, getMyOrders } from "@/sanity/helpers";
import SearchBar from "./SearchBar";
import MobileMenu from "./MobileMenu";

const Header = async () => {
  const user = await currentUser();
  const { userId } = await auth();
  let orders = null;
  if (userId) {
    orders = await getMyOrders(userId);
  }
  const categories = await getAllCategories();

  return (
    <header className="bg-white border-b border-b-gray-200 shadow-xs py-5 sticky top-0 z-50">
      <Container className="flex items-center justify-between gap-7 text-lightColor">
        <div className="w-auto lg:w-1/3 flex items-center">
          <MobileMenu />
          <Logo>
            Turbo<p className="text-darkColor items-center">meck</p>
          </Logo>
        </div>
        <HeaderMenu categories={categories} />
        <div className="w-auto flex items-center justify-end gap-5">
          <SearchBar />
          <CartIcon />

          <ClerkLoaded>
            <SignedIn>
              <Link href={"/orders"} className="group relative">
                <ListOrdered className="w-5 h-5 group-hover:text-darkColor hoverEffect" />
                <span className="absolute -top-1 -right-1 bg-gray-900 text-white h-3.5 w-3.5 rounded-full text-xs font-semibold flex justify-center items-center">
                  {orders?.length ? orders?.length : 0}
                </span>
              </Link>
              <UserButton />
            </SignedIn>
            {!user && (
              <SignInButton mode="modal">
                <button className="text-sm font-semibold hover:text-darkColor hoverEffect">
                  Logga in
                </button>
              </SignInButton>
            )}
          </ClerkLoaded>
        </div>
      </Container>
    </header>
  );
};

export default Header;
