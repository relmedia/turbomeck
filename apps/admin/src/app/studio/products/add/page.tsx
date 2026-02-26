"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddProductForm } from "@/components/AddProductForm";

export default function AddProductPage() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/studio/products" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till Produkter
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Lägg till Produkt</CardTitle>
        </CardHeader>
        <CardContent>
          <AddProductForm onSuccess={() => router.push("/studio/products")} />
        </CardContent>
      </Card>
    </div>
  );
}
