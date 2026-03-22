"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 py-12 px-4">
      <ShieldX className="h-16 w-16 text-destructive" />
      <h1 className="text-2xl font-semibold">Åtkomst nekad</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Du är inloggad men har inte behörighet att öppna admin-panelen.
        Kontakta en administratör för att få rollen &quot;admin&quot; tilldelad.
      </p>
      <div className="flex gap-4">
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/studio/logga-in" })}>
          Logga ut
        </Button>
        <Button asChild>
          <Link href="/">Tillbaka till startsidan</Link>
        </Button>
      </div>
    </div>
  );
}
