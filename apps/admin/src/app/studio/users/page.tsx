import { clerkClient } from "@clerk/nextjs/server";
import { User, columns } from "./columns";
import { DataTable } from "./data-table";

const getData = async (): Promise<{ users: User[]; error?: string }> => {
  try {
    const client = await clerkClient();
    const response = await client.users.getUserList({ limit: 100 });
    const users = response.data.map((u) => ({
      id: u.id,
      avatar: u.imageUrl ?? "/users/1.png",
      fullName: [u.firstName, u.lastName].filter(Boolean).join(" ") || "—",
      email: u.primaryEmailAddress?.emailAddress ?? "—",
      status: u.banned ? ("inaktiv" as const) : ("aktiv" as const),
    }));
    return { users };
  } catch (err) {
    console.error("Failed to fetch users:", err);
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return {
      users: [],
      error: `Kunde inte hämta användare: ${message}. Kontrollera att CLERK_SECRET_KEY finns i apps/admin/.env.local (samma nyckel som i apps/client/.env).`,
    };
  }
};

const UsersPage = async () => {
  const { users, error } = await getData();
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
      <DataTable columns={columns} data={users} />
    </div>
  );
};

export default UsersPage;
