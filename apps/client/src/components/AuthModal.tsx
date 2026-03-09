"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/i18n/context";

type AuthMode = "login" | "register" | "forgot";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: AuthMode;
  callbackUrl?: string;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("size-5", className)} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("size-5", className)} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function AuthModal({
  open,
  onOpenChange,
  defaultMode = "login",
  callbackUrl = "/",
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [loginMethod, setLoginMethod] = useState<"password" | "emailLink">("password");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const t = useTranslation();

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setError("");
    setLoading(false);
    setShowPassword(false);
    setForgotSuccess(false);
    setDevResetUrl(null);
    setAcceptTerms(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError("");
    setForgotSuccess(false);
    setDevResetUrl(null);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Kunde inte skicka återställningslänk");
        return;
      }
      setForgotSuccess(true);
      setEmail("");
      if (data.resetUrl) setDevResetUrl(data.resetUrl);
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn("email", {
        email: email.trim().toLowerCase(),
        callbackUrl,
        redirect: true,
      });
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptTerms) {
      setError("Du måste godkänna integritetspolicyn och köpvillkoren.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Kunde inte skapa konto");
        return;
      }
      switchMode("login");
      setError("");
      setEmail("");
      setPassword("");
      setName("");
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = (provider: string) => {
    signIn(provider, { callbackUrl });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden">
        <div className="flex flex-col p-6 sm:p-8">
          {/* Header / Branding */}
          <div className="flex flex-col items-center text-center mb-6">
            <DialogTitle className="text-2xl font-bold tracking-tight">
              {mode === "login" && "Välkommen tillbaka"}
              {mode === "register" && "Skapa konto"}
              {mode === "forgot" && "Glömt lösenord?"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "login" && "Ange din e-post så skickar vi en inloggningslänk till din mejl"}
              {mode === "register" && "Fyll i uppgifterna för att registrera dig"}
              {mode === "forgot" && "Ange din e-post så skickar vi en återställningslänk"}
            </p>
          </div>

          {mode === "forgot" ? (
            <>
              {forgotSuccess ? (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {devResetUrl
                      ? "E-post är inte konfigurerad. Använd länken nedan för att återställa lösenordet:"
                      : "Om ett konto finns för denna e-post har vi skickat en återställningslänk. Kontrollera din e-post."}
                  </p>
                  {devResetUrl && (
                    <a
                      href={devResetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary break-all block cursor-pointer hover:text-primary/90"
                    >
                      {devResetUrl}
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full cursor-pointer"
                    onClick={() => switchMode("login")}
                  >
                    {t("auth.backToLogin")}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="modal-forgot-email" className="text-sm font-medium">
                      {t("auth.email")} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="modal-forgot-email"
                      type="email"
                      placeholder="Ange din e-postadress"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-10"
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full h-10 cursor-pointer" disabled={loading}>
                    {loading ? t("auth.sending") : t("auth.sendResetLink")}
                  </Button>
                </form>
              )}
            </>
          ) : (
            <>
          {/* Social login buttons */}
          <div className="flex gap-3 mb-6">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-10 border rounded-md cursor-pointer"
              onClick={() => handleSocialSignIn("google")}
            >
              <GoogleIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-10 border rounded-md cursor-pointer"
              onClick={() => handleSocialSignIn("facebook")}
            >
              <FacebookIcon className="text-[#1877F2]" />
            </Button>
          </div>

          {/* Separator */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">{t("auth.or")}</span>
            </div>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="modal-email" className="text-sm font-medium">
                  {t("auth.email")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="modal-email"
                  type="email"
                  placeholder="Ange din e-postadress"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Vi skickar en inloggningslänk till din e-post. Klicka på länken för att logga in.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-10 cursor-pointer" disabled={loading}>
                {loading ? "Skickar länk..." : "Skicka inloggningslänk"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="modal-name" className="text-sm font-medium">
                  {t("auth.fullName")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="modal-name"
                  type="text"
                  placeholder={t("auth.fullNamePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modal-reg-email" className="text-sm font-medium">
                  {t("auth.email")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="modal-reg-email"
                  type="email"
                  placeholder="Ange din e-postadress"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modal-reg-password" className="text-sm font-medium">
                  {t("auth.password")} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="modal-reg-password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.passwordMinLength")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={acceptTerms}
                  onCheckedChange={(v) => setAcceptTerms(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm text-muted-foreground">
                  Jag godkänner{" "}
                  <Link href="/privacy" target="_blank" className="hover:text-foreground cursor-pointer">
                    integritetspolicyn
                  </Link>
                  {" "}och{" "}
                  <Link href="/terms" target="_blank" className="hover:text-foreground cursor-pointer">
                    köpvillkoren
                  </Link>
                  {" "}
                  <span className="text-destructive">*</span>
                </span>
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full h-10 cursor-pointer" disabled={loading}>
                {loading ? t("auth.creating") : t("auth.createAccount")}
              </Button>
            </form>
          )}
            </>
          )}

          {/* Switch mode link */}
          {mode !== "forgot" && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === "login" ? (
              <>
                {t("auth.noAccount")}{" "}
                <button
                  type="button"
                  className="font-medium text-foreground cursor-pointer hover:text-foreground/90"
                  onClick={() => switchMode("register")}
                >
                  {t("auth.createAccountLink")}
                </button>
              </>
            ) : (
              <>
                {t("auth.haveAccount")}{" "}
                <button
                  type="button"
                  className="font-medium text-foreground cursor-pointer hover:text-foreground/90"
                  onClick={() => switchMode("login")}
                >
                  {t("auth.login")}
                </button>
              </>
            )}
          </p>
          )}
          {mode === "forgot" && !forgotSuccess && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              <button
                type="button"
                className="font-medium text-foreground cursor-pointer hover:text-foreground/90"
                onClick={() => switchMode("login")}
              >
                {t("auth.backToLogin")}
              </button>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
