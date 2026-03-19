"use client";

import type { FC } from "react";
import { useEffect, useState } from "react";
import {
  shippingFormSchema,
  type SavedAddress,
} from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
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
import { PhoneInput, EUROPEAN_COUNTRIES, CountryFlag } from "./PhoneInput";
import { getDefaultCountryFromBrowser } from "@/lib/utils";
import { useTranslation } from "@/i18n/context";

const addressSchema = shippingFormSchema.pick({
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  country: true,
  address: true,
  city: true,
  postalCode: true,
});

type AddressFormInputs = z.infer<typeof addressSchema>;

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

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AddressFormInputs>({
    resolver: zodResolver(addressSchema as any),
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
    } catch (err) {
      setError("Kunde inte spara adressen. Försök igen.");
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
          <Label htmlFor="addr-firstName">Förnamn</Label>
          <Input
            id="addr-firstName"
            placeholder="Förnamn"
            {...register("firstName")}
            className={errors.firstName ? "border-destructive" : ""}
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="addr-lastName">Efternamn</Label>
          <Input
            id="addr-lastName"
            placeholder="Efternamn"
            {...register("lastName")}
            className={errors.lastName ? "border-destructive" : ""}
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">{errors.lastName.message}</p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="addr-email">E-post</Label>
        <Input
          id="addr-email"
          type="email"
          placeholder="E-postadress"
          {...register("email")}
          className={errors.email ? "border-destructive" : ""}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Mobilnummer</Label>
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
        <Label htmlFor="addr-country">Land</Label>
        <Controller
          name="country"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="addr-country"
                className={errors.country ? "border-destructive" : ""}
              >
                <SelectValue placeholder="Välj land" />
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
        <Label htmlFor="addr-address">Adress</Label>
        <Input
          id="addr-address"
          placeholder="Gatuadress"
          {...register("address")}
          className={errors.address ? "border-destructive" : ""}
        />
        {errors.address && (
          <p className="text-xs text-destructive">{errors.address.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="addr-city">Ort</Label>
          <Input
            id="addr-city"
            placeholder="Ortens namn"
            {...register("city")}
            className={errors.city ? "border-destructive" : ""}
          />
          {errors.city && (
            <p className="text-xs text-destructive">{errors.city.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="addr-postalCode">Postkod</Label>
          <Input
            id="addr-postalCode"
            placeholder="Postnummer"
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
          {saving ? "Sparar..." : "Spara adress"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Avbryt
          </Button>
        )}
      </div>
    </form>
  );
};

export default AddressEditForm;
