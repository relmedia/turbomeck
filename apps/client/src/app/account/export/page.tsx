"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2 } from "lucide-react";

export default function ExportDataPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export-data");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Kunde inte exportera data");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `turbomeck-mina-uppgifter-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="w-full mt-12 flex justify-center">
        <div className="animate-pulse text-muted-foreground">Laddar...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card>
          <CardHeader>
            <CardTitle>Exportera mina uppgifter</CardTitle>
            <p className="text-sm text-muted-foreground">
              Logga in för att exportera dina personuppgifter.
            </p>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>Logga in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-8 mb-16">
      <div className="mb-8">
        <Link
          href="/account"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Tillbaka till kontot
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Exportera mina uppgifter
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Enligt GDPR har du rätt till dataportabilitet. Hämta en kopia av dina
            personuppgifter i JSON-format. Filen innehåller din profil, sparad adress,
            önskelista och orderhistorik.
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-destructive mb-4">{error}</p>
          )}
          <Button onClick={handleExport} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Exporterar...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Ladda ner mina uppgifter
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
