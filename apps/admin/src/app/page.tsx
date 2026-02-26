import { auth } from "@repo/auth";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/studio");
  }
  redirect("/logga-in");
}
