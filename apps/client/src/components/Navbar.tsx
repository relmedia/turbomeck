"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import SearchBar from "./SearchBar";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { User, LogOut, MapPin, Key } from "lucide-react";
import { useTranslation } from "@/i18n/context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import ShoppingCartIcon from "./ShoppingCartIcon";
import WishlistIcon from "./WishlistIcon";
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
  const t = useTranslation();
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
        <WishlistIcon />
        <ShoppingCartIcon />
        <LanguageSwitcher />
        {status !== "loading" && (
          <>
            {!session ? (
              <>
                <button
                  type="button"
                  className="cursor-pointer"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthOpen(true);
                  }}
                  aria-label={t("nav.login")}
                >
                  <User className="w-4 h-4 text-gray-600" />
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
                  <Button variant="ghost" size="icon" className="rounded-full overflow-hidden p-0 h-8 w-8 shrink-0 cursor-pointer">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={session.user.image ?? undefined}
                        alt="Profil"
                      />
                      <AvatarFallback>
                        {(session.user.name ?? session.user.email ?? "?")
                          .split(/[\s@]/)
                          .filter(Boolean)
                          .map((s) => s[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/account">
                      <User className="w-4 h-4 mr-2" />
                      {t("nav.myAccount")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account?section=address">
                      <MapPin className="w-4 h-4 mr-2" />
                      {t("nav.deliveryAddress")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account?section=password">
                      <Key className="w-4 h-4 mr-2" />
                      {t("nav.changePassword")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("nav.logout")}
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
