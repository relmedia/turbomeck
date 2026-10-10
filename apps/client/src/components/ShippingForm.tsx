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
import { ArrowRight, Package, MapPin, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import { cn, getDefaultCountryFromBrowser } from "@/lib/utils";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { PhoneInput } from "./PhoneInput";
import ServicePointPicker from "./ServicePointPicker";
import PostNordDeliveryOptions from "./PostNordDeliveryOptions";
import type {
  PostNordAddress,
  PostNordDeliveryOptionsSelection,
} from "@/lib/postnord-delivery-options-types";
import { EUROPEAN_COUNTRIES, CountryFlag } from "./PhoneInput";
import { POSTNORD_SERVICE_POINT_COUNTRIES } from "@/lib/postnord";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { signIn } from "next-auth/react";

type ShippingFormProps = {
  setShippingForm: (data: ShippingFormInputs) => void;
  onSuccess?: () => void;
  onDeliveryChange?: (
    deliveryOption: "home" | "servicepoint",
    country: string,
  ) => void;
  /** Called when user picks a structured Delivery Options API alternative. */
  onDeliveryOptionsSelection?: (
    selection: PostNordDeliveryOptionsSelection | null,
  ) => void;
  /**
   * Reserved for future use (e.g. weight-aware option filtering).
   * Currently unused — the new Delivery Options API doesn't take cart contents.
   */
  cartItems?: CartItemType[];
  /** Pre-fill form when user has a saved address (e.g. from Clerk metadata) */
  defaultAddress?: Partial<ShippingFormInputs>;
  /** If true, show "Spara adress till mitt konto" checkbox (user must be logged in) */
  showSaveAddressOption?: boolean;
  /**
   * If true, offer to create an account — the guest counterpart of
   * `showSaveAddressOption`. The two are mutually exclusive in practice: a
   * signed-in buyer saves an address, a guest is offered the account.
   */
  showAccountOffer?: boolean;
};

const ShippingForm: FC<ShippingFormProps> = ({
  setShippingForm,
  onSuccess,
  onDeliveryChange,
  onDeliveryOptionsSelection,
  defaultAddress,
  showSaveAddressOption = false,
  showAccountOffer = false,
}) => {
  const { locale } = useLanguage();
  const t = useTranslation();
  const [saveToAccount, setSaveToAccount] = useState(false);
  /**
   * The account offer, as local state rather than form fields: none of it is
   * part of the order, and the order must go through whether or not it works.
   */
  const [createAccount, setCreateAccount] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  /**
   * Remount counter for the challenge. Turnstile tokens expire in minutes and
   * `TurnstileWidget` reports the expiry as an empty token without re-solving
   * (its render effect returns early once a widget id exists), so the only way
   * back to a usable token is a fresh mount. Filling in an address — picking a
   * service point especially — easily outlasts one token.
   *
   * Keyed locally rather than fixed inside `TurnstileWidget`, which is shared
   * with AuthModal and ContactModal.
   */
  const [turnstileEpoch, setTurnstileEpoch] = useState(0);
  const [deliveryOption, setDeliveryOption] = useState<"home" | "servicepoint">(
    "servicepoint",
  );
  const [selectedServicePoint, setSelectedServicePoint] =
    useState<PostNordServicePoint | null>(null);
  const [postNordDeliveryOption, setPostNordDeliveryOption] =
    useState<PostNordDeliveryOptionsSelection | null>(null);
  const [detectedCountry, setDetectedCountry] = useState<string>("SE");

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
    country.toUpperCase() as "SE" | "NO" | "DK",
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

  /**
   * Translate a PostNord Delivery Options selection into the form's existing
   * delivery state, so the rest of the cart payload (deliveryOption +
   * servicePoint) stays unchanged.
   *
   *   - service-point / parcel-locker → "servicepoint" + populated location
   *   - home / groupage / mailbox / express-mailbox → "home" + clear location
   */
  const handleDeliveryOptionsSelect = useCallback(
    (selection: PostNordDeliveryOptionsSelection | null) => {
      setPostNordDeliveryOption(selection);
      onDeliveryOptionsSelection?.(selection);

      if (!selection) {
        setSelectedServicePoint(null);
        return;
      }

      const isPickup =
        selection.type === "service-point" ||
        selection.type === "parcel-locker";

      if (isPickup) {
        setDeliveryOption("servicepoint");
        if (selection.servicePointId && selection.locationName) {
          setSelectedServicePoint({
            servicePointId: selection.servicePointId,
            name: selection.locationName,
            address: selection.locationAddress
              ? [
                  selection.locationAddress.streetName,
                  selection.locationAddress.streetNumber,
                ]
                  .filter(Boolean)
                  .join(" ")
              : "",
            postalCode: selection.locationAddress?.postCode ?? "",
            city: selection.locationAddress?.city ?? "",
            countryCode: selection.locationAddress?.countryCode ?? country,
          });
        } else {
          setSelectedServicePoint(null);
        }
      } else {
        setDeliveryOption("home");
        setSelectedServicePoint(null);
      }
    },
    [country, onDeliveryOptionsSelection],
  );

  const recipient = useMemo<PostNordAddress | null>(() => {
    const street = (watch("address") ?? "").trim();
    const post = (watch("postalCode") ?? "").trim();
    const cityVal = (watch("city") ?? "").trim();
    const countryVal = country.toUpperCase();
    if (!street || !post || !cityVal || !countryVal) return null;
    const m = street.match(/^(.*?)(?:\s+(\d+\w?))?$/);
    return {
      streetName: m?.[1]?.trim() || street,
      ...(m?.[2] ? { streetNumber: m[2].trim() } : {}),
      postCode: post,
      city: cityVal,
      countryCode: countryVal,
    };
    // `watch` is referentially stable; values are read inside so we depend
    // on the live values rather than `watch` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch("address"), watch("postalCode"), watch("city"), country]);

  const isDeliveryComplete = useMemo(() => {
    if (isPostNordCountry) {
      return Boolean(postNordDeliveryOption?.deliveryOptionId);
    }
    if (deliveryOption === "home") return true;
    if (deliveryOption === "servicepoint") return selectedServicePoint != null;
    return false;
  }, [
    isPostNordCountry,
    postNordDeliveryOption,
    deliveryOption,
    selectedServicePoint,
  ]);

  const handleShippingForm: SubmitHandler<ShippingFormInputs> = async (
    data,
  ) => {
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
    /**
     * The account offer, sent here rather than after payment because the
     * Turnstile token is single-use and expires in minutes — `TurnstileWidget`
     * zeroes it on `expired-callback`, and `requireTurnstile` rejects an empty
     * one. By the time payment clears it would usually be dead.
     *
     * Fire-and-forget, like the address above: nothing here writes a user row
     * or touches the order, so a failure must never be allowed to interrupt a
     * purchase. The buyer can always register later, and the order confirmation
     * page offers again.
     */
    if (showAccountOffer && createAccount && acceptedTerms) {
      const email = data.email.trim().toLowerCase();
      try {
        // Two steps, as in AuthModal: this one validates, records the consent
        // and parks the display name in a cookie — it mails nothing and writes
        // no user row. The `signIn` below is what actually sends the link, and
        // verifying that link is what creates the account.
        const res = await fetch("/api/auth/sign-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            name: `${data.firstName} ${data.lastName}`.trim() || undefined,
            acceptedTerms: true,
            turnstileToken,
          }),
          // A slow Turnstile verify must not hold the buyer on the
          // "Fortsätt" button; the account is optional, the order is not.
          signal: AbortSignal.timeout(6000),
        });
        // Rejected for rate limit, challenge or validation. Deliberately shown
        // as nothing at all: any per-outcome message here would turn the cart
        // into an account-existence oracle. The success page offers again.
        if (res.ok) {
          await signIn("email", {
            email,
            callbackUrl: "/account",
            redirect: false,
          });
        }
      } catch {
        // Silently fail - the order does not depend on the account.
      }
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.push("/cart?step=3", { scroll: false });
    }
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

      {/* Leveranssätt: PostNord Delivery Options API i Norden, manuellt läge i övriga länder. */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/25 p-4">
        <p className="text-sm font-medium">{t("shipping.deliveryMethod")}</p>
        {isPostNordCountry ? (
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
                }}
                className="w-4 h-4 accent-primary"
              />
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{t("shipping.postNordAbroad")}</span>
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
            <p className="text-xs text-destructive">
              {errors.firstName.message}
            </p>
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
            <p className="text-xs text-destructive">
              {errors.lastName.message}
            </p>
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

      {showAccountOffer && (
        <div
          className={cn(
            "rounded-lg border p-4 transition-colors",
            createAccount
              ? "border-primary/40 bg-primary/10"
              : "border-primary/20 bg-primary/5",
          )}
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={createAccount}
              onChange={(e) => setCreateAccount(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                <UserPlus
                  className="h-4 w-4 shrink-0 text-primary"
                  aria-hidden
                />
                {t("cart.createAccountOffer")}
              </span>
              {/* Shown unticked too: the reason to opt in has to be readable
                  before the decision, not after it. */}
              <span className="text-xs text-muted-foreground">
                {t("cart.createAccountOfferDesc")}
              </span>
            </span>
          </label>
          {createAccount && (
            <div className="mt-3 flex flex-col gap-2 border-t border-primary/20 pt-3 pl-7">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded accent-primary"
                />
                {t("cart.createAccountTerms")}
              </label>
              {/* Renders nothing until this deployment has Turnstile keys. */}
              <TurnstileWidget
                key={turnstileEpoch}
                onToken={(token) => {
                  setTurnstileToken(token);
                  if (!token) setTurnstileEpoch((n) => n + 1);
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 pt-4 border-t border-border">
        {isPostNordCountry ? (
          <PostNordDeliveryOptions
            recipient={recipient}
            language={locale === "en" ? "en" : "sv"}
            selectedDeliveryOptionId={
              postNordDeliveryOption?.deliveryOptionId ?? null
            }
            onSelectionChange={handleDeliveryOptionsSelect}
          />
        ) : deliveryOption === "servicepoint" ? (
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
