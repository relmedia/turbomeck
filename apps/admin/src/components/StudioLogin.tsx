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

const loginSchema = z.object({
  email: z.string().email({ message: "Ange en giltig e-postadress" }),
  password: z.string().min(1, { message: "Lösenord krävs" }),
});

type SignInValues = z.infer<typeof loginSchema>;

function SignInContent() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/studio";
  const errorParam = searchParams.get("error");
  const error =
    errorParam === "CredentialsSignin"
      ? "Fel e-post eller lösenord"
      : errorParam
        ? "Inloggningen misslyckades"
        : "";

  const form = useForm<SignInValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
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
      const csrfData = await csrfRes.json();
      const csrfToken = csrfData?.csrfToken;
      if (!csrfToken) {
        throw new Error("Kunde inte hämta säkerhetstoken.");
      }

      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken,
          email: values.email,
          password: values.password,
          callbackUrl,
        }).toString(),
        redirect: "follow",
      });

      if (res.url?.includes("error=")) {
        throw new Error("Fel e-post eller lösenord");
      }

      window.location.href = callbackUrl;
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
          <CardTitle>Admin Login</CardTitle>
          <CardDescription>
            Logga in med din e-post och lösenord
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
                          placeholder="admin@example.com"
                          autoComplete="email"
                          className="w-full"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="password">Lösenord</FormLabel>
                      <FormControl>
                        <Input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          autoComplete="current-password"
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
                    {loading ? "Loggar in..." : "Logga in"}
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
