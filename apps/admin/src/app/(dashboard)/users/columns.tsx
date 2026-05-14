"use client";

import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { ArrowUpDown, Copy, ExternalLink, Mail, MoreHorizontal, Trash2, User } from "lucide-react";
import Link from "next/link";
import { toast } from "react-toastify";

export type User = {
  id: string;
  avatar: string;
  fullName: string;
  email: string;
  status: "aktiv" | "inaktiv";
};

function DeleteUserDialog({
  user,
  onDelete,
}: {
  user: User;
  onDelete: (id: string) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(user.id);
      setOpen(false);
    } catch (err) {
      console.error("Delete user failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Ta bort användare
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ta bort användare?</AlertDialogTitle>
          <AlertDialogDescription>
            Du håller på att ta bort{" "}
            <span className="font-medium text-foreground">{user.fullName}</span>
            {user.email ? ` (${user.email})` : ""}. Konto, sessioner och
            recensioner raderas permanent. Eventuella ordrar bevaras för
            historik. Denna åtgärd kan inte ångras.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isDeleting ? "Tar bort..." : "Ta bort permanent"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type CreateColumnsOptions = {
  /** Currently signed-in admin id – delete is hidden for this row. */
  currentUserId?: string | null;
  /** Called when the admin confirms a deletion in the dialog. */
  onDelete?: (id: string) => Promise<void>;
};

export const createColumns = (
  options: CreateColumnsOptions = {},
): ColumnDef<User>[] => {
  const { currentUserId, onDelete } = options;

  return [
    {
      id: "select",
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          checked={row.getIsSelected()}
        />
      ),
    },
    {
      accessorKey: "avatar",
      header: "Avatar",
      cell: ({ row }) => {
        const user = row.original;
        const src = user.avatar?.trim();
        return (
          <Avatar className="size-9">
            {src ? (
              <AvatarImage src={src} alt={user.fullName} />
            ) : null}
            <AvatarFallback>
              <User className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Ingen profilbild</span>
            </AvatarFallback>
          </Avatar>
        );
      },
    },
    {
      accessorKey: "fullName",
      header: "Namn",
      cell: ({ row }) => {
        const user = row.original;
        const isMe = currentUserId && user.id === currentUserId;
        return (
          <span className="flex items-center gap-2">
            {user.fullName}
            {isMe && (
              <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                Du
              </span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "email",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            E-post
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status");

        return (
          <div
            className={cn(
              `p-1 rounded-md w-max text-xs`,

              status === "aktiv" && "bg-green-500/40",
              status === "inaktiv" && "bg-red-500/40"
            )}
          >
            {status as string}
          </div>
        );
      },
    },

    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const user = row.original;
        const isCurrentUser = currentUserId && user.id === currentUserId;
        const canDelete = !isCurrentUser && typeof onDelete === "function";
        const emailRaw = user.email?.trim() ?? "";
        const hasMailto = emailRaw.includes("@");

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Öppna meny</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium leading-tight text-foreground">
                    {user.fullName}
                  </span>
                  <span className="text-xs leading-tight text-muted-foreground break-all">
                    {user.email || "—"}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(user.id);
                    toast.success("Användar-ID kopierat till urklipp");
                  } catch {
                    toast.error("Kunde inte kopiera användar-ID");
                  }
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Kopiera användar-ID
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(user.email);
                    toast.success("E-post kopierad till urklipp");
                  } catch {
                    toast.error("Kunde inte kopiera e-post");
                  }
                }}
                disabled={!user.email || user.email === "—"}
              >
                <Copy className="w-4 h-4 mr-2" />
                Kopiera e-post
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/users/${user.id}`}>
                  <User className="w-4 h-4 mr-2" />
                  Visa kunddata
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/users/${user.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Öppna i ny flik
                </Link>
              </DropdownMenuItem>
              {hasMailto && (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${emailRaw}`}>
                    <Mail className="w-4 h-4 mr-2" />
                    Skicka e-post
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {canDelete ? (
                <DeleteUserDialog user={user} onDelete={onDelete!} />
              ) : (
                <DropdownMenuItem
                  disabled
                  className="text-destructive focus:text-destructive"
                  title={
                    isCurrentUser
                      ? "Du kan inte ta bort ditt eget konto"
                      : "Borttagning är inte tillgänglig"
                  }
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Ta bort användare
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
};

/**
 * Backwards-compatible default columns (no delete action).
 * Prefer `createColumns({ currentUserId, onDelete })` from a client page.
 */
export const columns: ColumnDef<User>[] = createColumns();
