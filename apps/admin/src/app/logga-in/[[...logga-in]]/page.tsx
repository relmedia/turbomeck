"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";

function SignInContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/studio";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (result?.error) {
        setError("Ogiltig e-post eller lösenord");
        return;
      }
      if (result?.ok) {
        window.location.href = callbackUrl;
        return;
      }
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

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
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">E-post</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Lösenord</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <span className="text-sm">Kom ihåg mig</span>
                  </label>
                  <Link
                    href="http://localhost:3002/reset-password"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    Glömt lösenord?
                  </Link>
                </div>
              </Field>
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
