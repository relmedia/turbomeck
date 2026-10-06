"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SearchBar from "./SearchBar";
import { MobileSearch } from "./MobileSearch";
import { MobileMenu } from "./MobileMenu";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { User, LogOut, MapPin, Mail} from "lucide-react";
import { useTranslation } from "@/i18n/context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";
import ShoppingCartIcon from "./ShoppingCartIcon";
import WishlistIcon from "./WishlistIcon";
import { useSession, signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Button } from "@repo/ui/components/button";
import { AuthModal } from "./AuthModal";
import { ContactModal } from "./ContactModal";
import { NavCategoriesInline } from "./NavCategoriesInline";

const Navbar = () => {
  const t = useTranslation();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [contactOpen, setContactOpen] = useState(false);
  // Categories nav is shown on the storefront pages (homepage + product list
  // + product detail at /products/[slug]).
  const showInlineCategories =
    pathname === "/" || pathname.startsWith("/products");

  return (
    <nav className="sticky top-0 z-30 mb-5 flex w-full items-center justify-between gap-4 border-b border-gray-200 bg-background/90 py-2 backdrop-blur supports-backdrop-filter:bg-background/75 sm:py-3 sm:mb-6">
      {/*LEFT*/}
      <div className="flex min-w-0 shrink items-center gap-3">
        <Suspense fallback={null}>
          <MobileMenu
            onContactClick={() => setContactOpen(true)}
            onAuthClick={() => {
              setAuthMode("login");
              setAuthOpen(true);
            }}
          />
        </Suspense>
        <Link href={"/"} className="flex items-center">
          <Image src="/logo.svg" alt="Turbomeck" width={35} height={35} />
          <p className="text-xl font-semibold tracking-wider italic lightGreen ms-2">
            TURBO
          </p>
          <p className="text-xl font-semibold text-gray-700 tracking-wider italic">
            MECK
          </p>
        </Link>
        {showInlineCategories && (
          <Suspense fallback={null}>
            <NavCategoriesInline />
          </Suspense>
        )}
        {/* Page links. Kontakt opens a modal instead of navigating so a visitor
            mid-browse doesn't lose their place.

            Always visible: the label shows from `sm` up, and below that it
            collapses to the mail icon so it survives a 360px phone without
            pushing the logo or the cart off the row. */}
        <nav aria-label={t("nav.pages")} className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            aria-label={t("contact.navLabel")}
          >
            <Mail className="size-4 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">{t("contact.navLabel")}</span>
          </button>
        </nav>
      </div>
      {/*RIGHT*/}
      <div className="flex shrink-0 items-center gap-4 sm:gap-5 md:gap-6">
        <Suspense
          fallback={
            <div
              className="h-9 w-full min-w-[120px] max-w-[200px] rounded-md bg-muted md:max-w-md"
              aria-hidden
            />
          }
        >
          <SearchBar />
        </Suspense>
        <Suspense fallback={null}>
          <MobileSearch />
        </Suspense>
        <WishlistIcon />
        <ShoppingCartIcon />
        <LanguageSwitcher className="hidden sm:inline-flex" />
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full overflow-hidden p-0 h-8 w-8 shrink-0 cursor-pointer"
                    aria-label={t("nav.openAccountMenu")}
                  >
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

      {/* Mounted outside the session-dependent branches above: the contact
          modal has to exist for signed-in visitors and during session loading,
          not only for signed-out ones. */}
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </nav>
  );
};

export default Navbar;
