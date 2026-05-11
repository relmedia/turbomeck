"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Field, FieldGroup } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
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

  /* Staff login must run on studio host; shop apex serves :3000 and mails turbomeck.cloud links. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const adminOrigin = (process.env.NEXT_PUBLIC_ADMIN_ORIGIN || "").replace(/\/$/, "");
    const shopHosts = (process.env.NEXT_PUBLIC_SHOP_LOGIN_HOSTS || "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (!adminOrigin || shopHosts.length === 0) return;
    if (!shopHosts.includes(window.location.hostname)) return;
    window.location.replace(`${adminOrigin}${window.location.pathname}${window.location.search}`);
  }, []);

  const handleSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    form.setError("root", { message: "" });
    try {
      /* Use next-auth/react signIn (same as storefront): Auth.js expects
       * X-Auth-Return-Redirect + JSON body; raw fetch often breaks with “Failed to fetch”. */
      const result = await signIn("email", {
        email: values.email.trim().toLowerCase(),
        callbackUrl,
        redirect: false,
      });
      if (!result) {
        form.setError("root", { message: "Inloggningen misslyckades" });
        return;
      }
      if (result.error) {
        const code = result.error;
        form.setError("root", {
          message:
            code === "EmailSignin"
              ? "Kunde inte skicka inloggningslänk. Kontrollera att e-post är konfigurerad i Inställningar."
              : code === "Verification"
                ? "Inloggningslänken är inte längre giltig. Den kan redan ha använts eller ha gått ut."
                : "Inloggningen misslyckades",
        });
        return;
      }
      if (result.ok && result.url) {
        window.location.href = result.url;
        return;
      }
      window.location.href = "/verify";
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
