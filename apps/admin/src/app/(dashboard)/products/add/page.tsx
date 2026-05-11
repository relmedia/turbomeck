"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { AddProductForm } from "@/components/AddProductForm";

export default function AddProductPage() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Lägg till Produkt</CardTitle>
        </CardHeader>
        <CardContent>
          <AddProductForm onSuccess={() => router.push("/products")} />
        </CardContent>
      </Card>
    </div>
  );
}
