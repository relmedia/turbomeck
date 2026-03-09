"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import AddUser from "@/components/AddUser";
import { User, columns } from "./columns";
import { DataTable } from "./data-table";
import { Plus, RefreshCw } from "lucide-react";

const UsersPage = () => {
  const [userList, setUserList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Kunde inte hämta användare");
      const list = await res.json();
      setUserList(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod");
      setUserList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div>
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Alla Användare</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hantera konto och behörigheter för alla användare
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="default" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Lägg till användare
              </Button>
            </SheetTrigger>
            <AddUser />
          </Sheet>
        </div>
      </div>
      {error && (
        <div className="mb-4 p-4 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center h-64 items-center">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={userList} />
      )}
    </div>
  );
};

export default UsersPage;
