"use client";

import { LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { useTheme } from "next-themes";

const THEME_ORDER = ["light", "dark", "system"] as const;

const Navbar = () => {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() ?? "?";

  const cycleTheme = () => {
    const current = theme || "system";
    const idx = THEME_ORDER.indexOf(current as (typeof THEME_ORDER)[number]);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    setTheme(next);
  };

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={cycleTheme} title="Byt tema (Ljus → Mörk → System)" className="cursor-pointer">
        <ThemeIcon className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">Byt tema</span>
      </Button>
      {/* USER AVATAR DROPDOWN */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative size-8 rounded-full cursor-pointer">
            <Avatar className="size-8">
              <AvatarImage src={session?.user?.image ?? undefined} alt={session?.user?.name ?? ""} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{session?.user?.name ?? "Användare"}</p>
              <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/studio/account" className="cursor-pointer">
                <User className="size-4" />
                Konto
              </Link>
            </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => signOut({ callbackUrl: "/logga-in" })}
          >
            <LogOut className="size-4" />
            Logga ut
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default Navbar;
