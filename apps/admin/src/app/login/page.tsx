import { auth } from "@repo/auth";
import { redirect } from "next/navigation";

/** /login → dashboard at / (rewritten to /studio internally). */
export default async function LoginAliasPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }
  redirect("/");
}
