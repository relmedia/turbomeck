"use client";

import { ChevronDown } from "lucide-react";
import { SE, GB } from "country-flag-icons/react/3x2";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/context";
import { cn } from "@/lib/utils";

const LOCALES = [
  { code: "sv" as const, Flag: SE, name: "SV" },
  { code: "en" as const, Flag: GB, name: "EN" },
] as const;

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
  const CurrentFlag = current.Flag;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 cursor-pointer font-medium"
          aria-label={locale === "sv" ? "Byt språk" : "Change language"}
        >
          <CurrentFlag
            title={current.code === "sv" ? "Svenska" : "English"}
            className="h-4 w-6 rounded-sm object-cover shrink-0"
          />
          <span>{current.name}</span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
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
