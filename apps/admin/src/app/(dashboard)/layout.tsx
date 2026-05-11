import { cookies } from "next/headers";
import { auth } from "@repo/auth";
import AppSidebar from "@/components/AppSidebar";
import { PageTitle } from "@/components/PageTitle";
import { StudioHeader } from "@/components/StudioHeader";
import { SidebarInset, SidebarProvider } from "@repo/ui/components/sidebar";

function isAdmin(userId: string, email: string | undefined, role: string | undefined): boolean {
  const allowlist = process.env.ADMIN_ALLOWLIST?.split(",").map((id) => id.trim()) ?? [];
  if (allowlist.includes(userId)) return true;
  if (email && allowlist.includes(email)) return true;
  return role === "admin";
}

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAuthenticated =
    session?.user &&
    isAdmin(session.user.id, session.user.email ?? undefined, session.user.role);

  // Not authenticated or not admin → render children without sidebar (login form)
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Authenticated admin → render with sidebar
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar variant="inset" collapsible="icon" />
      <div className="m-2 ml-0 flex min-h-svh flex-1 justify-center">
        <SidebarInset className="w-full max-w-[1440px] rounded-xl shadow-sm">
          <StudioHeader />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:gap-6 md:p-6">
            <PageTitle />
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
