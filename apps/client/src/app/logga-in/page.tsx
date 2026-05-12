"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { AuthModal } from "@/components/AuthModal";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * SECURITY (audit M1): only accept same-origin absolute paths as the
 * post-login redirect target. Without this, `?callbackUrl=//evil.com` or
 * `?callbackUrl=https://evil.com` would let an attacker bounce a logged-in
 * user off our domain into a phishing page that wears the just-logged-in
 * trust signal. Auth.js itself clamps OAuth redirects on the server side
 * (`packages/auth/src/index.ts` `redirect` callback) but this client-side
 * `router.replace` runs after the modal closes and would otherwise honor
 * whatever the URL said.
 */
function sanitizeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/";
  // Reject scheme-relative ("//evil.com") and absolute URLs entirely;
  // only allow a leading single slash followed by an alphanumeric / dash
  // / underscore. Query strings and hashes are preserved.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}

function LoggaInContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const errorParam = searchParams.get("error");
  const callbackUrl = sanitizeCallbackUrl(searchParams.get("callbackUrl"));
  const [authOpen, setAuthOpen] = useState(!errorParam);

  const handleAuthOpenChange = (open: boolean) => {
    setAuthOpen(open);
    if (!open) router.replace(callbackUrl);
  };

  const verificationError =
    errorParam === "Verification"
      ? "Inloggningslänken är inte längre giltig. Den kan redan ha använts eller ha gått ut."
      : null;

  if (!errorParam) {
    return (
      <div className="flex flex-col gap-6 min-h-[60vh] items-center justify-center py-12 px-4">
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
        <AuthModal
          open={authOpen}
          onOpenChange={handleAuthOpenChange}
          defaultMode="login"
          callbackUrl={callbackUrl}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 min-h-[60vh] items-center justify-center py-12 px-4">
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
          <CardTitle>Kunde inte logga in</CardTitle>
          <CardDescription>
            {verificationError ?? "Inloggningen misslyckades."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/">Gå till startsidan</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoggaInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
          Laddar...
        </div>
      }
    >
      <LoggaInContent />
    </Suspense>
  );
}
