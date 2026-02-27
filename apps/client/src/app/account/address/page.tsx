"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AccountAddressPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/account");
  }, [router]);
  return null;
}
