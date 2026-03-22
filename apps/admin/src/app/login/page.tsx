import { auth } from "@repo/auth";
import { redirect } from "next/navigation";

/** English alias for the admin entry: dashboard is /studio, not /login. */
export default async function LoginAliasPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/studio");
  }
  redirect("/studio/logga-in");
}
