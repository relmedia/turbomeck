"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import Image from "next/image";

const emailLinkSchema = z.object({
  email: z.string().email({ message: "Ange en giltig e-postadress" }),
});

type SignInValues = z.infer<typeof emailLinkSchema>;

function SignInContent() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const errorParam = searchParams.get("error");
  const error =
    errorParam === "EmailSignin"
      ? "Kunde inte skicka inloggningslänk. Kontrollera att e-post är konfigurerad i Inställningar."
      : errorParam === "Verification"
        ? "Inloggningslänken är inte längre giltig. Den kan redan ha använts eller ha gått ut."
        : errorParam
          ? "Inloggningen misslyckades"
          : "";

  const form = useForm<SignInValues>({
    resolver: zodResolver(emailLinkSchema),
    defaultValues: { email: "" },
  });

  const formatDateTime = () => {
    const now = new Date();
    return {
      date: now.toLocaleDateString("sv-SE", { dateStyle: "medium" }),
      time: now.toLocaleTimeString("sv-SE", { timeStyle: "medium" }),
    };
  };

  const [dateTime, setDateTime] = useState(() => formatDateTime());

  useEffect(() => {
    const tick = () => setDateTime(formatDateTime());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    form.setError("root", { message: "" });
    try {
      const csrfRes = await fetch("/api/auth/csrf");
      const csrfText = await csrfRes.text();
      if (!csrfRes.ok) {
        throw new Error("Kunde inte hämta säkerhetstoken. Försök igen.");
      }
      let csrfToken: string;
      try {
        const csrfData = JSON.parse(csrfText);
        csrfToken = csrfData?.csrfToken ?? "";
      } catch {
        throw new Error("Ogiltigt svar från servern. Försök igen.");
      }
      if (!csrfToken) {
        throw new Error("Saknar säkerhetstoken.");
      }
      const params = new URLSearchParams({
        csrfToken,
        email: values.email,
        callbackUrl,
      });
      const res = await fetch("/api/auth/signin/email", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) {
        const text = await res.text();
        const match = text.match(/error=([^&"'\s]+)/);
        const errCode = match?.[1];
        throw new Error(
          errCode ? decodeURIComponent(errCode) : "Inloggningen misslyckades"
        );
      }
      const targetUrl = res.redirected && res.url ? res.url : "/studio/verify";
      window.location.href = targetUrl;
    } catch (err) {
      form.setError("root", {
        message: err instanceof Error ? err.message : "Något gick fel",
      });
    } finally {
      setLoading(false);
    }
  });

  return (
    <div
      className={cn(
        "flex flex-col gap-6 min-h-screen items-center justify-center bg-background py-12 px-4"
      )}
    >
      <div className="flex items-center justify-center gap-3">
        <Image
          src="/logo.svg"
          alt=""
          width={34}
          height={34}
          priority
          className="shrink-0"
        />
        <span className="text-xl font-semibold italic uppercase tracking-tight">
          <span className="text-[#6ec900]">TURBO</span>
          <span className="text-slate-700 dark:text-slate-300">MECK</span>
        </span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Logga in till ditt konto</CardTitle>
          <CardDescription>
            Ange din e-post så skickar vi en inloggningslänk till din mejl
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="email">E-post</FormLabel>
                      <FormControl>
                        <Input
                          id="email"
                          type="email"
                          placeholder="m@example.com"
                          autoComplete="email"
                          className="w-full"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(error || form.formState.errors.root?.message) && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.root?.message || error}
                  </p>
                )}
                <Field>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Skickar länk..." : "Skicka inloggningslänk"}
                  </Button>
                </Field>
                <Field>
                  <div className="text-muted-foreground text-sm text-center flex items-center justify-center gap-2 pt-2">
                    <span>{dateTime.date}</span>
                    <span>{dateTime.time}</span>
                  </div>
                </Field>
              </FieldGroup>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export function StudioLogin() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
          Laddar...
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
