import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 py-12">
      <h1 className="text-2xl font-semibold">Logga in till Studio</h1>
      <p className="text-muted-foreground text-sm">
        Admin-panel: http://localhost:3001/studio
      </p>
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
          },
        }}
        fallbackRedirectUrl="/studio"
      />
    </div>
  );
}
