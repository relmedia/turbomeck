"use client";

import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  EUROPEAN_COUNTRY_CODES,
  type SavedAddress,
} from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
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
import { PhoneInput, EUROPEAN_COUNTRIES, CountryFlag } from "./PhoneInput";
import { getDefaultCountryFromBrowser } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";

type AddressFormInputs = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  city: string;
  postalCode: string;
};

type AddressEditFormProps = {
  initialAddress?: SavedAddress | null;
  onSave: (address: SavedAddress) => Promise<void>;
  onCancel?: () => void;
};

const AddressEditForm: FC<AddressEditFormProps> = ({
  initialAddress,
  onSave,
  onCancel,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslation();

  const addressSchema = useMemo(
    () =>
      z.object({
        firstName: z.string().min(1, t("shipping.validation.firstNameRequired")),
        lastName: z.string().min(1, t("shipping.validation.lastNameRequired")),
        email: z
          .string()
          .regex(
            /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            t("shipping.validation.emailInvalid"),
          )
          .min(1, t("shipping.validation.emailRequired")),
        phone: z
          .string()
          .min(10, t("shipping.validation.phoneMin"))
          .regex(/^\+\d{10,15}$/, t("shipping.validation.phoneEuropean")),
        country: z
          .string()
          .refine(
            (v) =>
              EUROPEAN_COUNTRY_CODES.includes(
                v as (typeof EUROPEAN_COUNTRY_CODES)[number],
              ),
            t("shipping.validation.countryEuropean"),
          ),
        address: z.string().min(1, t("shipping.validation.addressRequired")),
        city: z.string().min(1, t("shipping.validation.cityRequired")),
        postalCode: z
          .string()
          .min(4, t("shipping.validation.postalMin"))
          .regex(/^\d+$/, t("shipping.validation.postalDigits")),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AddressFormInputs>({
    resolver: zodResolver(addressSchema as never),
    defaultValues: {
      country: "SE",
      phone: "",
      ...initialAddress,
    },
  });

  useEffect(() => {
    if (initialAddress) {
      reset({
        ...initialAddress,
        country: initialAddress.country ?? "SE",
        phone: initialAddress.phone ?? "",
      });
    }
  }, [initialAddress, reset]);

  const onSubmit: SubmitHandler<AddressFormInputs> = async (data) => {
    setError(null);
    setSaving(true);
    try {
      await onSave(data);
      if (onCancel) onCancel();
    } catch {
      setError(t("account.addressSaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(onSubmit)}
    >
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="addr-firstName">{t("shipping.firstName")}</Label>
          <Input
            id="addr-firstName"
            placeholder={t("shipping.firstName")}
            {...register("firstName")}
            className={errors.firstName ? "border-destructive" : ""}
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="addr-lastName">{t("shipping.lastName")}</Label>
          <Input
            id="addr-lastName"
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
        <Label htmlFor="addr-email">{t("shipping.email")}</Label>
        <Input
          id="addr-email"
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
              defaultCountry={getDefaultCountryFromBrowser()}
              className={errors.phone ? "[&_input]:border-destructive" : ""}
            />
          )}
        />
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="addr-country">{t("shipping.country")}</Label>
        <Controller
          name="country"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="addr-country"
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
      <div className="space-y-2">
        <Label htmlFor="addr-address">{t("shipping.address")}</Label>
        <Input
          id="addr-address"
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
          <Label htmlFor="addr-city">{t("shipping.city")}</Label>
          <Input
            id="addr-city"
            placeholder={t("shipping.cityPlaceholder")}
            {...register("city")}
            className={errors.city ? "border-destructive" : ""}
          />
          {errors.city && (
            <p className="text-xs text-destructive">{errors.city.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="addr-postalCode">{t("shipping.postalCode")}</Label>
          <Input
            id="addr-postalCode"
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
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? t("account.saving") : t("shipping.saveAddressSubmit")}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
};

export default AddressEditForm;
