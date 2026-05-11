"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Eye, EyeOff } from "lucide-react";

function ResetPasswordContent() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (password !== confirmPassword) {
        setError("Lösenorden matchar inte");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Kunde inte återställa lösenord");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="w-full flex justify-center py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-xl font-semibold">Ogiltig länk</h1>
          <p className="text-muted-foreground">
            Återställningslänken saknas eller är ogiltig. Begär en ny länk från
            inloggningssidan.
          </p>
          <Button asChild>
            <Link href="/">Till startsidan</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full flex justify-center py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-xl font-semibold">Lösenord återställt</h1>
          <p className="text-muted-foreground">
            Ditt lösenord har uppdaterats. Du kan nu logga in med ditt nya lösenord.
          </p>
          <Button asChild>
            <Link href="/">Logga in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center py-12">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-center">Återställ lösenord</h1>
        <p className="text-sm text-muted-foreground text-center">
          Ange ett nytt lösenord nedan.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nytt lösenord *</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Bekräfta lösenord *</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Återställer..." : "Återställ lösenord"}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            Tillbaka till startsidan
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="w-full flex justify-center py-12 text-muted-foreground">Laddar...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
