"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { InactivityTimeout } from "./InactivityTimeout";

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <InactivityTimeout />
      {children}
    </NextAuthSessionProvider>
  );
}
