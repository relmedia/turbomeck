import { db } from "@repo/database";
import { users } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge } from "@repo/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@repo/ui/components/hover-card";
import { Progress } from "@repo/ui/components/progress";
import { BadgeCheck, Shield } from "lucide-react";
import { Sheet, SheetTrigger } from "@repo/ui/components/sheet";
import { Button } from "@repo/ui/components/button";
import EditUser from "@/components/EditUser";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

type Props = { params: Promise<{ id: string }> };

async function getUserData(userId: string) {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    const savedAddress = user.metadata?.savedAddress as
      | {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        address?: string;
        city?: string;
        postalCode?: string;
        country?: string;
      }
      | undefined;

    const fullName = user.name ?? "—";
    const email = user.email ?? "—";
    const phone = savedAddress?.phone ?? "—";
    const address = savedAddress?.address ?? "—";
    const city = savedAddress?.city ?? "—";
    const postalCode = savedAddress?.postalCode ?? "—";
    const country = savedAddress?.country ?? "—";
    const createdAt = user.createdAt
      ? format(new Date(user.createdAt), "d MMM yyyy", { locale: sv })
      : "—";

    const fields = [
      fullName !== "—",
      email !== "—",
      phone !== "—",
      address !== "—",
      city !== "—",
    ];
    const filledCount = fields.filter(Boolean).length;
    const completionPercent = Math.round((filledCount / 5) * 100);

    return {
      id: user.id,
      fullName,
      email,
      phone,
      address,
      city,
      postalCode,
      country,
      imageUrl: user.image,
      createdAt,
      completionPercent,
      isAdmin: user.role === "admin",
      emailVerifiedAt: user.emailVerified
        ? format(new Date(user.emailVerified), "d MMM yyyy", { locale: sv })
        : null,
    };
  } catch {
    return null;
  }
}

const SingleUserPage = async ({ params }: Props) => {
  const { id } = await params;
  const user = await getUserData(id);

  if (!user) {
    notFound();
  }

  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <div className="">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/users">Kunder</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{user.fullName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mt-4 flex flex-col xl:flex-row gap-8">
        <div className="w-full space-y-6">
          {/* Only badges backed by real account data - no decorative ones. */}
          {(user.emailVerifiedAt || user.isAdmin) && (
            <div className="bg-primary-foreground p-4 rounded-lg">
              <h1 className="text-xl font-semibold">Märken</h1>
              <div className="flex gap-4 mt-4">
                {user.emailVerifiedAt && (
                  <HoverCard>
                    <HoverCardTrigger>
                      <BadgeCheck
                        size={36}
                        className="rounded-full bg-blue-500/30 border-1 border-blue-500/50 p-2"
                      />
                    </HoverCardTrigger>
                    <HoverCardContent>
                      <h1 className="font-bold mb-2">Verifierad e-post</h1>
                      <p className="text-sm text-muted-foreground">
                        E-postadressen bekräftades {user.emailVerifiedAt}.
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                )}
                {user.isAdmin && (
                  <HoverCard>
                    <HoverCardTrigger>
                      <Shield
                        size={36}
                        className="rounded-full bg-green-800/30 border-1 border-green-800/50 p-2"
                      />
                    </HoverCardTrigger>
                    <HoverCardContent>
                      <h1 className="font-bold mb-2">Administratör</h1>
                      <p className="text-sm text-muted-foreground">
                        Kontot har rollen admin och har tillgång till Studio.
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                )}
              </div>
            </div>
          )}
          <div className="bg-primary-foreground p-4 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Avatar className="size-12">
                <AvatarImage src={user.imageUrl ?? undefined} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <h1 className="text-xl font-semibold">{user.fullName}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {user.address !== "—" || user.city !== "—"
                ? `${user.address}${user.address && user.city ? ", " : ""}${user.postalCode} ${user.city}${user.country !== "—" ? `, ${user.country}` : ""}`
                : "Ingen adress angiven."}
            </p>
          </div>
          <div className="bg-primary-foreground p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Användarinformation</h1>
              <Sheet>
                <SheetTrigger asChild>
                  <Button>Ändra</Button>
                </SheetTrigger>
                <EditUser
                  userId={user.id}
                  defaultValues={{
                    fullName: user.fullName !== "—" ? user.fullName : "",
                    email: user.email !== "—" ? user.email : "",
                    phone: user.phone !== "—" ? user.phone : "",
                    address: user.address !== "—" ? user.address : "",
                    city: user.city !== "—" ? user.city : "",
                  }}
                />
              </Sheet>
            </div>
            <div className="space-y-4 mt-4">
              <div className="flex flex-col gap-2 mb-8">
                <p className="text-sm text-muted-foreground">
                  Komplettering av profil
                </p>
                <Progress value={user.completionPercent} />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">Fullt namn:</span>
                <span>{user.fullName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">E-post:</span>
                <span>{user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">Mobilnummer:</span>
                <span>{user.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">Adress:</span>
                <span>{user.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">Ort:</span>
                <span>{user.city}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Registrerings datum {user.createdAt}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SingleUserPage;
