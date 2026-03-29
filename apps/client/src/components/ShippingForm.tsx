"use client";

import type { FC } from "react";
import { useLanguage, useTranslation } from "@/i18n/context";
import {
  ShippingFormInputs,
  shippingFormSchema,
  type CartItemType,
  type PostNordServicePoint,
} from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Package, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getDefaultCountryFromBrowser } from "@/lib/utils";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "./PhoneInput";
import ServicePointPicker from "./ServicePointPicker";
import PostNordShippingModule, {
  type PostNordShippingSelection,
} from "./PostNordShippingModule";
import { EUROPEAN_COUNTRIES, CountryFlag } from "./PhoneInput";
import { POSTNORD_SERVICE_POINT_COUNTRIES } from "@/lib/postnord";

/** Show PostNord widget when URL is configured (falls back to manual options on error) */
const POSTNORD_ENABLED =
  typeof process.env.NEXT_PUBLIC_POSTNORD_SHIPPING_MODULE_URL === "string" &&
  process.env.NEXT_PUBLIC_POSTNORD_SHIPPING_MODULE_URL.length > 0;

type ShippingFormProps = {
  setShippingForm: (data: ShippingFormInputs) => void;
  onSuccess?: () => void;
  onDeliveryChange?: (
    deliveryOption: "home" | "servicepoint",
    country: string
  ) => void;
  /** Called when user selects a shipping option from PostNord widget (price in SEK) */
  onPostNordSelection?: (selection: PostNordShippingSelection | null) => void;
  cartItems?: CartItemType[];
  /** Pre-fill form when user has a saved address (e.g. from Clerk metadata) */
  defaultAddress?: Partial<ShippingFormInputs>;
  /** If true, show "Spara adress till mitt konto" checkbox (user must be logged in) */
  showSaveAddressOption?: boolean;
  /** Parent holds latest PostNord widget selection (required to enable Continue when widget is active) */
  postNordSelection?: PostNordShippingSelection | null;
};

const ShippingForm: FC<ShippingFormProps> = ({
  setShippingForm,
  onSuccess,
  onDeliveryChange,
  onPostNordSelection,
  cartItems = [],
  defaultAddress,
  showSaveAddressOption = false,
  postNordSelection = null,
}) => {
  const { locale } = useLanguage();
  const t = useTranslation();
  const [saveToAccount, setSaveToAccount] = useState(false);
  const [deliveryOption, setDeliveryOption] = useState<
    "home" | "servicepoint"
  >("servicepoint");
  const [selectedServicePoint, setSelectedServicePoint] =
    useState<PostNordServicePoint | null>(null);
  const [detectedCountry, setDetectedCountry] = useState<string>("SE");
  const [postNordFailed, setPostNordFailed] = useState(false);

  const handlePostNordError = useCallback(() => {
    setPostNordFailed(true);
    onPostNordSelection?.(null);
  }, [onPostNordSelection]);

  useEffect(() => {
    setDetectedCountry(getDefaultCountryFromBrowser());
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    reset,
    formState: { errors, isValid },
  } = useForm<ShippingFormInputs>({
    resolver: zodResolver(shippingFormSchema as any),
    mode: "onChange",
    defaultValues: {
      country: "SE",
      phone: "",
      ...defaultAddress,
    },
  });

  // When defaultAddress loads async (e.g. from Clerk user), reset form to pre-fill
  useEffect(() => {
    if (defaultAddress && Object.keys(defaultAddress).length > 0) {
      reset((prev) => ({ ...prev, ...defaultAddress }));
    }
  }, [defaultAddress, reset]);

  useEffect(() => {
    if (!defaultAddress?.country) {
      setValue("country", detectedCountry);
    }
  }, [detectedCountry, setValue, defaultAddress?.country]);

  const postalCode = watch("postalCode");
  const city = watch("city");
  const country = watch("country") ?? "SE";
  const isPostNordCountry = POSTNORD_SERVICE_POINT_COUNTRIES.includes(
    country.toUpperCase() as "SE" | "NO" | "DK"
  );

  const router = useRouter();

  useEffect(() => {
    onDeliveryChange?.(deliveryOption, country);
  }, [deliveryOption, country, onDeliveryChange]);

  // Clear service point when switching to country without PostNord ombud
  useEffect(() => {
    const cc = (country ?? "SE").toUpperCase();
    if (
      selectedServicePoint &&
      !POSTNORD_SERVICE_POINT_COUNTRIES.includes(cc as "SE" | "NO" | "DK")
    ) {
      setSelectedServicePoint(null);
    }
  }, [country, selectedServicePoint]);

  // Auto-update country from postal code when user enters address
  useEffect(() => {
    const code = (postalCode ?? "").replace(/\s/g, "").trim();
    if (code.length < 4) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams({ postalCode: code });
      if (city?.trim()) params.set("city", city.trim());
      fetch(`/api/address/lookup-country?${params}`)
        .then((r) => r.json())
        .then((data) => {
          const cc = data?.countryCode?.toUpperCase();
          if (cc && EUROPEAN_COUNTRIES.some((c) => c.code === cc)) {
            setValue("country", cc);
          }
        })
        .catch(() => {});
    }, 500);

    return () => clearTimeout(timer);
  }, [postalCode, city, setValue]);

  const handlePostNordSelect = useCallback(
    (selection: PostNordShippingSelection | null) => {
      onPostNordSelection?.(selection);
      if (selection?.servicePointId && selection?.displayName) {
        setSelectedServicePoint({
          servicePointId: selection.servicePointId,
          name: selection.displayName,
          address: "",
          postalCode: "",
          city: "",
          countryCode: country,
        });
      } else {
        setSelectedServicePoint(null);
      }
    },
    [country, onPostNordSelection]
  );

  const isDeliveryComplete = useMemo(() => {
    if (POSTNORD_ENABLED && !postNordFailed) {
      const s = postNordSelection;
      return Boolean(
        s?.sessionId?.trim() &&
          s.price != null &&
          Number.isFinite(Number(s.price))
      );
    }
    if (deliveryOption === "home") return true;
    if (deliveryOption === "servicepoint") {
      if (isPostNordCountry) return selectedServicePoint != null;
      return true;
    }
    return false;
  }, [
    postNordFailed,
    postNordSelection,
    deliveryOption,
    isPostNordCountry,
    selectedServicePoint,
  ]);

  const handleShippingForm: SubmitHandler<ShippingFormInputs> = async (data) => {
    if (!isDeliveryComplete) return;
    setShippingForm({
      ...data,
      deliveryOption,
      servicePoint: selectedServicePoint ?? undefined,
    });
    if (showSaveAddressOption && saveToAccount) {
      try {
        await fetch("/api/user/address", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            country: data.country,
            address: data.address,
            city: data.city,
            postalCode: data.postalCode,
          }),
        });
      } catch {
        // Silently fail - address still used for this order
      }
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.push("/cart?step=3", { scroll: false });
    }
  };

  const formValues = {
    firstName: watch("firstName"),
    lastName: watch("lastName"),
    email: watch("email"),
    phone: watch("phone"),
    country: watch("country"),
    address: watch("address"),
    city: watch("city"),
    postalCode: watch("postalCode"),
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(handleShippingForm)}
    >
      <div className="space-y-2">
        <Label htmlFor="country">{t("shipping.country")}</Label>
        <Controller
          name="country"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                onDeliveryChange?.(deliveryOption, v ?? "SE");
              }}
            >
              <SelectTrigger
                id="country"
                className={errors.country ? "border-destructive" : ""}
              >
                <SelectValue placeholder={t("shipping.selectCountry")} />
              </SelectTrigger>
              <SelectContent>
                {EUROPEAN_COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="flex items-center gap-2">
                      <CountryFlag code={c.code} />
                      <span>{t(`shipping.countryNames.${c.code}`)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.country && (
          <p className="text-xs text-destructive">{errors.country.message}</p>
        )}
      </div>

      {/* Leveranssätt först (manuellt läge: radioknappar; PostNord-läge: instruktion) */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/25 p-4">
        <p className="text-sm font-medium">{t("shipping.deliveryMethod")}</p>
        {POSTNORD_ENABLED && !postNordFailed ? (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("shipping.postNordChooseAfterAddress")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="deliveryOption"
                checked={deliveryOption === "home"}
                onChange={() => {
                  setDeliveryOption("home");
                  setSelectedServicePoint(null);
                  onPostNordSelection?.(null);
                }}
                className="w-4 h-4 accent-primary"
              />
              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{t("shipping.homeDelivery")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="deliveryOption"
                checked={deliveryOption === "servicepoint"}
                onChange={() => {
                  setDeliveryOption("servicepoint");
                  onPostNordSelection?.(null);
                }}
                className="w-4 h-4 accent-primary"
              />
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm">
                {isPostNordCountry
                  ? t("shipping.postNordServicepoint")
                  : t("shipping.postNordAbroad")}
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("shipping.firstName")}</Label>
          <Input
            id="firstName"
            placeholder={t("shipping.firstName")}
            {...register("firstName")}
            className={errors.firstName ? "border-destructive" : ""}
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t("shipping.lastName")}</Label>
          <Input
            id="lastName"
            placeholder={t("shipping.lastName")}
            {...register("lastName")}
            className={errors.lastName ? "border-destructive" : ""}
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t("shipping.email")}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t("shipping.emailPlaceholder")}
          {...register("email")}
          className={errors.email ? "border-destructive" : ""}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t("shipping.phone")}</Label>
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <PhoneInput
              value={field.value}
              onChange={field.onChange}
              defaultCountry={detectedCountry}
              className={errors.phone ? "[&_input]:border-destructive" : ""}
            />
          )}
        />
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">{t("shipping.address")}</Label>
        <Input
          id="address"
          placeholder={t("shipping.addressPlaceholder")}
          {...register("address")}
          className={errors.address ? "border-destructive" : ""}
        />
        {errors.address && (
          <p className="text-xs text-destructive">{errors.address.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">{t("shipping.city")}</Label>
          <Input
            id="city"
            placeholder={t("shipping.cityPlaceholder")}
            {...register("city")}
            className={errors.city ? "border-destructive" : ""}
          />
          {errors.city && (
            <p className="text-xs text-destructive">{errors.city.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="postalCode">{t("shipping.postalCode")}</Label>
          <Input
            id="postalCode"
            placeholder={t("shipping.postalCodePlaceholder")}
            {...register("postalCode")}
            className={errors.postalCode ? "border-destructive" : ""}
          />
          {errors.postalCode && (
            <p className="text-xs text-destructive">
              {errors.postalCode.message}
            </p>
          )}
        </div>
      </div>

      {showSaveAddressOption &&
        (defaultAddress &&
        (defaultAddress.address ||
          defaultAddress.postalCode ||
          defaultAddress.city) ? (
          <p className="text-sm text-muted-foreground">
            {t("shipping.addressSaved")}
          </p>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={saveToAccount}
              onChange={(e) => setSaveToAccount(e.target.checked)}
              className="w-4 h-4 accent-primary rounded"
            />
            {t("shipping.saveAddress")}
          </label>
        ))}

      <div className="flex flex-col gap-3 pt-4 border-t border-border">
        {POSTNORD_ENABLED && !postNordFailed ? (
          <PostNordShippingModule
            formData={formValues}
            cartItems={cartItems}
            language={locale === "en" ? "en" : "sv"}
            onShippingChange={handlePostNordSelect}
            onError={handlePostNordError}
          />
        ) : (
          <>
            {deliveryOption === "servicepoint" &&
              (isPostNordCountry ? (
                <ServicePointPicker
                  postalCode={postalCode ?? ""}
                  city={city ?? ""}
                  country={country}
                  selectedPoint={selectedServicePoint}
                  onSelect={setSelectedServicePoint}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("shipping.deliveryToAddress")}
                </p>
              ))}
          </>
        )}
      </div>

      {isValid && !isDeliveryComplete && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {t("shipping.deliveryIncomplete")}
        </p>
      )}

      <Button
        type="submit"
        disabled={!isValid || !isDeliveryComplete}
        className="w-full cursor-pointer"
      >
        {t("shipping.continue")}
        <ArrowRight className="w-3 h-3" />
      </Button>
    </form>
  );
};

export default ShippingForm;
