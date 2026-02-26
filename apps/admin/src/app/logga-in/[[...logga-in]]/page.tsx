"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
import {
  Field,
  FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";

const signInSchema = z.object({
  email: z.string().email({ message: "Ange en giltig e-postadress" }),
  password: z.string().min(1, { message: "Lösenord krävs" }),
  rememberMe: z.boolean().default(false),
});

type SignInValues = z.infer<typeof signInSchema>;

function SignInContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/studio";
  const errorParam = searchParams.get("error");
  const error =
    errorParam === "CredentialsSignin"
      ? "Ogiltig e-post eller lösenord"
      : errorParam
        ? "Inloggningen misslyckades"
        : "";

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
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
    try {
      await signIn("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl,
        redirect: true,
      });
    } finally {
      setLoading(false);
    }
  });

  return (
    <div className={cn("flex flex-col gap-6 min-h-screen items-center justify-center bg-background py-12 px-4")}>
      <div className="flex items-center justify-center gap-3">
        <Image
          src="/logo.svg"
          alt=""
          width={34}
          height={34}
          priority
          className="flex-shrink-0"
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
            Ange din e-post nedan för att logga in till Admin-panelen
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
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="password">Lösenord</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            className="pr-10"
                            {...field}
                          />
                        </FormControl>
                        <button
                          type="button"
                          aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-4 mt-2">
                        <FormField
                          control={form.control}
                          name="rememberMe"
                          render={({ field }) => (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                id="remember"
                                checked={field.value}
                                onCheckedChange={(checked) => field.onChange(checked === true)}
                              />
                              <span className="text-sm">Kom ihåg mig</span>
                            </label>
                          )}
                        />
                        <Link
                    href="http://localhost:3002/reset-password"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    Glömt lösenord?
                  </Link>
                      </div>
                    </FormItem>
                  )}
                />
              {error && <p className="text-sm text-destructive">{error}</p>}
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

export default function LoggaInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Laddar...</div>}>
      <SignInContent />
    </Suspense>
  );
}
