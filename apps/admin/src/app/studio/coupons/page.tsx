"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Tag, RefreshCw } from "lucide-react";

type Coupon = {
  id: number;
  code: string;
  discountType: string;
  discountValue: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  createdAt: string | null;
};

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrderAmount, setMinOrderAmount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchCoupons = () => {
    setLoading(true);
    fetch("/api/coupons")
      .then((r) => r.json())
      .then(setCoupons)
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.trim(),
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        minOrderAmount: minOrderAmount.trim() ? parseFloat(minOrderAmount) : null,
        maxUses: maxUses.trim() ? parseInt(maxUses, 10) : null,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setCode("");
        setDiscountValue("");
        setMinOrderAmount("");
        setMaxUses("");
        fetchCoupons();
      })
      .catch((err) => setError(err.message || "Kunde inte skapa rabattkod"))
      .finally(() => setSubmitting(false));
  };

  const handleDelete = (id: number) => {
    if (!confirm("Ta bort denna rabattkod?")) return;
    fetch(`/api/coupons/${id}`, { method: "DELETE" })
      .then((r) => (r.ok ? fetchCoupons() : Promise.reject()))
      .catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Rabattkoder</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Skapa och hantera rabattkoder för kundvagnen
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchCoupons}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Skapa ny rabattkod
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <div className="grid gap-2">
                <Label htmlFor="code">Kod</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="t.ex. RABATT10"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="discountType">Typ</Label>
                  <Select
                    value={discountType}
                    onValueChange={(v) => setDiscountType(v as "percent" | "fixed")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Procent</SelectItem>
                      <SelectItem value="fixed">Fast belopp (kr)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="discountValue">
                    {discountType === "percent" ? "Procent (%)" : "Belopp (kr)"}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    min={1}
                    max={discountType === "percent" ? 100 : undefined}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === "percent" ? "10" : "50"}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="minOrderAmount">Minstordervärde (kr)</Label>
                  <Input
                    id="minOrderAmount"
                    type="number"
                    min={0}
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    placeholder="T.ex. 500"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="maxUses">Max användningar</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    min={0}
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="Obegränsat"
                  />
                </div>
              </div>
              <Button type="submit" disabled={submitting}>
                <Plus className="h-4 w-4 mr-2" />
                Skapa rabattkod
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aktiva rabattkoder</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Laddar...</p>
            ) : coupons.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Inga rabattkoder ännu. Skapa en till vänster.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kod</TableHead>
                    <TableHead>Rabatt</TableHead>
                    <TableHead>Min.order</TableHead>
                    <TableHead>Använd</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.code}</TableCell>
                      <TableCell>
                        {c.discountType === "percent"
                          ? `${c.discountValue}%`
                          : `${c.discountValue} kr`}
                      </TableCell>
                      <TableCell>
                        {c.minOrderAmount
                          ? `${c.minOrderAmount.toLocaleString("sv-SE")} kr`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {c.maxUses != null
                          ? `${c.usedCount} / ${c.maxUses}`
                          : c.usedCount}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
