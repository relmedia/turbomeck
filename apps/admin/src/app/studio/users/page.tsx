import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { User, columns } from "./columns";
import { DataTable } from "./data-table";

export const dynamic = "force-dynamic";

function getFullName(u: { name: string | null; metadata?: unknown }): string {
  const meta = u.metadata as { savedAddress?: Record<string, unknown> } | null | undefined;
  const saved = meta?.savedAddress;
  if (saved && typeof saved === "object") {
    const first = (saved.firstName ?? saved.first_name) as string | undefined;
    const last = (saved.lastName ?? saved.last_name) as string | undefined;
    if (first != null || last != null) {
      const full = [first ?? "", last ?? ""].filter(Boolean).join(" ").trim();
      if (full) return full;
    }
  }
  return u.name ?? "—";
}

const getData = async (): Promise<{ users: User[]; error?: string }> => {
  try {
    const rows = await db.select().from(users).limit(100);
    const userList: User[] = rows.map((u) => ({
      id: u.id ?? "",
      avatar: u.image ?? "/users/1.png",
      fullName: getFullName(u),
      email: u.email ?? "—",
      status: "aktiv" as const,
    }));
    return { users: userList };
  } catch (err) {
    console.error("Failed to fetch users:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      users: [],
      error: `Kunde inte hämta användare: ${message}. Kontrollera att DATABASE_URL finns i .env.local.`,
    };
  }
};

const UsersPage = async () => {
  const { users: userList, error } = await getData();
  return (
    <div className="">
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md">
        <h1 className="font-semibold">Alla Användare</h1>
      </div>
      {error && (
        <div className="mb-4 p-4 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <DataTable columns={columns} data={userList} />
    </div>
  );
};

export default UsersPage;
