"use client";

import { Globe } from "lucide-react";
import { SE, GB } from "country-flag-icons/react/3x2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/i18n/context";
import { cn } from "@/lib/utils";

const LOCALES = [
  { code: "sv" as const, Flag: SE, name: "SV" },
  { code: "en" as const, Flag: GB, name: "EN" },
] as const;

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="cursor-pointer"
          aria-label={locale === "sv" ? "Byt språk" : "Change language"}
        >
          <Globe className="w-4 h-4 text-gray-600" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((loc) => {
          const LocFlag = loc.Flag;
          return (
            <DropdownMenuItem
              key={loc.code}
              onClick={() => setLocale(loc.code)}
              className={cn(
                "gap-2 cursor-pointer",
                locale === loc.code && "bg-accent"
              )}
            >
              <LocFlag
                title={loc.code === "sv" ? "Svenska" : "English"}
                className="h-4 w-6 rounded-sm object-cover shrink-0"
              />
              {loc.name}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
