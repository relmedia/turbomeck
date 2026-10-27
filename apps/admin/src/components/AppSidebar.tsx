"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Home,
  ImageIcon,
  Plus,
  Package,
  Settings,
  Star,
  Tag,
  Truck,
  User,
  ShoppingBag,
  FolderTree,
  LogOut,
  EllipsisVertical,
  RotateCcw,
  ChevronRight,
  Mail,
  BellRing,
  Send,
  Users,
  LayoutTemplate,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@repo/ui/components/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import Link from "next/link";
import Image from "next/image";
import { Sheet, SheetTrigger } from "@repo/ui/components/sheet";
import AddOrder from "./AddOrder";
import AddCategory from "./AddCategory";

const items = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Startsidan slider",
    url: "/slider",
    icon: ImageIcon,
  },
  {
    title: "Recensioner",
    url: "/reviews",
    icon: Star,
  },
  {
    title: "Användare",
    url: "/users",
    icon: Users,
  },
];

/**
 * Settings sub-pages. Separate from `items` because this group renders as a
 * collapsible section rather than flat rows.
 *
 * Användare is NOT here — it sits under Applikation with the other
 * day-to-day destinations. Its old "Lägg till användare" row is still gone on
 * purpose: /users has its own button (users/page.tsx:140-147), so the sidebar
 * copy was a duplicate.
 */
const settingsItems = [
  { title: "Mail", url: "/settings/mail", icon: Mail },
  { title: "Order-notiser", url: "/settings/notiser", icon: BellRing },
  { title: "Kundutskick", url: "/settings/kundutskick", icon: Send },
  { title: "Frakt & PostNord", url: "/settings/frakt", icon: Truck },
  { title: "E-postdesign", url: "/settings/design", icon: LayoutTemplate },
];

/**
 * Whether a nav href matches the current path.
 *
 * Exact for "/" — every path starts with it. Prefix elsewhere, so a drill-down
 * like /payments/261 still highlights Ordrar. Mirrors the convention already
 * used by PageTitle.tsx.
 */
function isActivePath(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

const getInitials = (name: string | null | undefined) =>
  name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

const AppSidebar = ({
  variant = "inset",
  collapsible = "icon",
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname() ?? "";
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const settingsOpen = settingsItems.some((i) => isActivePath(pathname, i.url));
  const initials = getInitials(session?.user?.name) || session?.user?.email?.[0]?.toUpperCase() || "?";
  return (
    <Sidebar variant={variant} collapsible={collapsible} {...props}>
      <SidebarHeader className="py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/" className="[&>span]:text-lg [&>span]:font-semibold">
                <Image src="/logo.svg" alt="logo" width={24} height={24} />
                <span>Turbomeck Studio</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Applikation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(pathname, item.url)}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.title === "Inkorg" && (
                    <SidebarMenuBadge>24</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Produkter</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/products">
                    <Package />
                    Visa alla Produkter
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/categories">
                    <FolderTree />
                    Visa alla Kategorier
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/products/add">
                    <Plus />
                    Lägg till produkt
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Sheet
                  open={categorySheetOpen}
                  onOpenChange={setCategorySheetOpen}
                >
                  <SheetTrigger asChild>
                    <SidebarMenuButton asChild>
                      <button type="button" className="cursor-pointer">
                        <Plus />
                        Lägg till Kategori
                      </button>
                    </SidebarMenuButton>
                  </SheetTrigger>
                  <AddCategory onSuccess={() => setCategorySheetOpen(false)} />
                </Sheet>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Ordrar / Transaktioner</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/payments">
                    <ShoppingBag />
                    Visa alla Transaktioner
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/refunds">
                    <RotateCcw />
                    Återbetalningar
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/shipping">
                    <Truck />
                    Leveransdetaljer
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/coupons">
                    <Tag />
                    Rabattkoder
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* A real button, not a Link to "#". It used to be a sheet
                  wrapped in two nested SidebarMenuButtons, which rendered a
                  button inside a button and left `asChild` with nothing
                  sensible to merge into. The dialog is controlled from here
                  instead, so the trigger is just a menu button. */}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setAddOrderOpen(true)}>
                  <Plus />
                  Lägg till Order
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Inställningar, last and collapsible.
            It used to sit fourth from the top, above Produkter and Ordrar —
            a place you visit occasionally occupying prime real estate.

            Two renderings, because the sidebar primitives force it:
            SidebarMenuSub carries `group-data-[collapsible=icon]:hidden`, so
            in icon mode the sub-links would not merely shrink, they would
            vanish — and collapsed is the default here, cookie-persisted, with
            a Cmd/Ctrl+B shortcut. Collapsed therefore gets a right-side
            DropdownMenu, the same pattern the user menu in the footer uses. */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isCollapsed ? (
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        isActive={settingsOpen}
                        tooltip="Inställningar"
                      >
                        <Settings />
                        <span>Inställningar</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      sideOffset={4}
                      className="min-w-48"
                    >
                      <DropdownMenuLabel>Inställningar</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {settingsItems.map((item) => (
                        <DropdownMenuItem key={item.url} asChild>
                          <Link href={item.url}>
                            <item.icon className="size-4" />
                            <span>{item.title}</span>
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : (
                <Collapsible defaultOpen={settingsOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton isActive={settingsOpen}>
                        <Settings />
                        <span>Inställningar</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {settingsItems.map((item) => (
                          <SidebarMenuSubItem key={item.url}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActivePath(pathname, item.url)}
                            >
                              <Link href={item.url}>
                                <item.icon className="size-4" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={session?.user?.image ?? undefined} alt={session?.user?.name ?? ""} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">{session?.user?.name ?? "Användare"}</span>
                    <span className="truncate text-xs text-muted-foreground">{session?.user?.email}</span>
                  </div>
                  <EllipsisVertical className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                side="right"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage src={session?.user?.image ?? undefined} alt={session?.user?.name ?? ""} />
                      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{session?.user?.name ?? "Användare"}</span>
                      <span className="truncate text-xs text-muted-foreground">{session?.user?.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account" className="cursor-pointer">
                    <User className="size-4" />
                    Konto
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="size-4" />
                  Logga ut
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <AddOrder open={addOrderOpen} onOpenChange={setAddOrderOpen} />
    </Sidebar>
  );
};

export default AppSidebar;
