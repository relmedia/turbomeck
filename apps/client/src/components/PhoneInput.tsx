"use client";

import * as React from "react";
import { useTranslation } from "@/i18n/context";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// European countries only: ISO 3166-1 alpha-2, dial code, flag image from CDN
const FLAG_CDN = "https://flagcdn.com";
const EUROPEAN_COUNTRIES = [
  { code: "SE", dial: "+46", name: "Sverige" },
  { code: "NO", dial: "+47", name: "Norge" },
  { code: "DK", dial: "+45", name: "Danmark" },
  { code: "FI", dial: "+358", name: "Finland" },
  { code: "DE", dial: "+49", name: "Tyskland" },
  { code: "NL", dial: "+31", name: "Nederländerna" },
  { code: "BE", dial: "+32", name: "Belgien" },
  { code: "FR", dial: "+33", name: "Frankrike" },
  { code: "ES", dial: "+34", name: "Spanien" },
  { code: "IT", dial: "+39", name: "Italien" },
  { code: "AT", dial: "+43", name: "Österrike" },
  { code: "CH", dial: "+41", name: "Schweiz" },
  { code: "PL", dial: "+48", name: "Polen" },
  { code: "CZ", dial: "+420", name: "Tjeckien" },
  { code: "IE", dial: "+353", name: "Irland" },
  { code: "GB", dial: "+44", name: "Storbritannien" },
  { code: "PT", dial: "+351", name: "Portugal" },
  { code: "GR", dial: "+30", name: "Grekland" },
  { code: "HU", dial: "+36", name: "Ungern" },
  { code: "RO", dial: "+40", name: "Rumänien" },
  { code: "BG", dial: "+359", name: "Bulgarien" },
  { code: "HR", dial: "+385", name: "Kroatien" },
  { code: "SK", dial: "+421", name: "Slovakien" },
  { code: "SI", dial: "+386", name: "Slovenien" },
  { code: "EE", dial: "+372", name: "Estland" },
  { code: "LV", dial: "+371", name: "Lettland" },
  { code: "LT", dial: "+370", name: "Litauen" },
  { code: "LU", dial: "+352", name: "Luxemburg" },
  { code: "MT", dial: "+356", name: "Malta" },
  { code: "CY", dial: "+357", name: "Cypern" },
  { code: "IS", dial: "+354", name: "Island" },
] as const;

function CountryFlag({ code }: { code: string }) {
  const src = `${FLAG_CDN}/w40/${code.toLowerCase()}.png`;
  return (
    <img
      src={src}
      alt=""
      className="w-5 h-4 object-cover rounded-sm shrink-0"
      loading="lazy"
    />
  );
}

function parsePhoneValue(val: string) {
  if (!val) return { country: "SE", number: "" };
  const c = [...EUROPEAN_COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((x) => val.startsWith(x.dial));
  if (c) {
    return {
      country: c.code,
      number: val.slice(c.dial.length).replace(/\D/g, ""),
    };
  }
  return { country: "SE", number: val.replace(/\D/g, "") };
}

type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "onChange" | "value"
> & {
  value?: string;
  onChange?: (value: string) => void;
  defaultCountry?: string;
};

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    { className, value = "", onChange, defaultCountry = "SE", ...props },
    ref
  ) => {
    const t = useTranslation();
    const parsed = React.useMemo(() => parsePhoneValue(value), [value]);
    const initialCountry = value ? parsed.country : defaultCountry;
    const [country, setCountry] = React.useState(initialCountry);
    const [number, setNumber] = React.useState(parsed.number);

    React.useEffect(() => {
      const p = parsePhoneValue(value);
      setCountry(p.country);
      setNumber(p.number);
    }, [value]);

    // Update country when defaultCountry changes (e.g. after browser language detection)
    React.useEffect(() => {
      if (!value) {
        setCountry(defaultCountry);
      }
    }, [defaultCountry, value]);

    const countryData = EUROPEAN_COUNTRIES.find((c) => c.code === country);

    const emit = React.useCallback(
      (c: string, n: string) => {
        const full = n ? `${EUROPEAN_COUNTRIES.find((x) => x.code === c)?.dial ?? ""}${n}` : "";
        onChange?.(full);
      },
      [onChange]
    );

    const handleCountryChange = (code: string) => {
      setCountry(code);
      const v = number.replace(/\D/g, "").slice(0, 15);
      setNumber(v);
      emit(code, v);
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.replace(/\D/g, "").slice(0, 15);
      setNumber(v);
      emit(country, v);
    };

    return (
      <div className={cn("flex gap-1", className)}>
        <Select value={country} onValueChange={handleCountryChange}>
          <SelectTrigger className="w-[120px] shrink-0">
            <SelectValue>
              <span className="flex items-center gap-2">
                <CountryFlag code={countryData?.code ?? "SE"} />
                <span className="text-xs text-muted-foreground">
                  {countryData?.dial}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EUROPEAN_COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-2">
                  <CountryFlag code={c.code} />
                  <span>{t(`shipping.country.${c.code}`)}</span>
                  <span className="text-muted-foreground text-xs">
                    {c.dial}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          ref={ref}
          type="tel"
          placeholder={t("shipping.phonePlaceholder")}
          value={number}
          onChange={handleNumberChange}
          className="flex-1"
          {...props}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput, EUROPEAN_COUNTRIES, CountryFlag };
