import { auth } from "@repo/auth";
import { redirect } from "next/navigation";
import { ChangeAvatarForm } from "@/components/ChangeAvatarForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/studio");
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="rounded-xl border bg-card p-6 md:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <ChangeAvatarForm
            currentImage={session.user.image ?? null}
            currentName={session.user.name ?? null}
          />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{session.user.name ?? "Användare"}</h2>
            <p className="text-muted-foreground">{session.user.email}</p>
          </div>
        </div>
        <p className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          Max 2 MB. JPEG, PNG, GIF eller WebP.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 md:p-6">
        <h3 className="text-lg font-semibold mb-4">Byt lösenord</h3>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
