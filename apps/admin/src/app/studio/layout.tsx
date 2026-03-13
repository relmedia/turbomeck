import { cookies } from "next/headers";
import AppSidebar from "@/components/AppSidebar";
import { PageTitle } from "@/components/PageTitle";
import { StudioHeader } from "@/components/StudioHeader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
