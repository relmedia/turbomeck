"use client";

import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";

export default function VerifyRequestPage() {
  return (
    <div className="flex flex-col gap-6 min-h-screen items-center justify-center bg-background py-12 px-4">
      <Link href="/" className="flex items-center justify-center gap-3">
        <Image
          src="/logo.svg"
          alt="Turbomeck"
          width={40}
          height={40}
          priority
          className="shrink-0"
        />
        <span className="text-xl font-semibold italic uppercase tracking-tight">
          <span className="text-[#6ec900]">TURBO</span>
          <span className="text-slate-700 dark:text-slate-300">MECK</span>
        </span>
      </Link>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Mail className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Kolla din e-post</h2>
        <p className="text-sm text-muted-foreground">
          Vi har skickat en inloggningslänk till din e-postadress. Klicka på länken i mailet för att logga in.
        </p>
      </div>
    </div>
  );
}
