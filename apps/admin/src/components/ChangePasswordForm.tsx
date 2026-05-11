"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Nuvarande lösenord krävs"),
    newPassword: z.string().min(6, "Nytt lösenord måste vara minst 6 tecken"),
    confirmPassword: z.string().min(1, "Bekräfta lösenord"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Lösenorden matchar inte",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export function ChangePasswordForm() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setStatus("idle");
    setErrorMessage("");
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(json.error ?? "Kunde inte ändra lösenord");
        return;
      }
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
      setErrorMessage("Nätverksfel. Försök igen.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="currentPassword">Nuvarande lösenord</FieldLabel>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            {...register("currentPassword")}
          />
          {errors.currentPassword && (
            <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="newPassword">Nytt lösenord</FieldLabel>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
          />
          {errors.newPassword && (
            <p className="text-sm text-destructive">{errors.newPassword.message}</p>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="confirmPassword">Bekräfta nytt lösenord</FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </Field>
      </FieldGroup>
      {status === "success" && (
        <p className="text-sm text-emerald-600">Lösenordet har ändrats.</p>
      )}
      {status === "error" && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sparar..." : "Byt lösenord"}
      </Button>
    </form>
  );
}
