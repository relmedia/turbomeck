"use client";

import { useState, useEffect } from "react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Plus, Trash2, Tag, RefreshCw, Pencil, Check, X } from "lucide-react";
import { DashboardCouponsTableSkeleton } from "@/components/dashboard-skeletons";

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
  /** Row currently being edited, with its in-progress values. */
  const [edit, setEdit] = useState<{
    id: number;
    discountType: "percent" | "fixed";
    discountValue: string;
    minOrderAmount: string;
    maxUses: string;
    active: boolean;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

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

  const startEdit = (c: Coupon) => {
    setEditError("");
    setEdit({
      id: c.id,
      discountType: c.discountType === "fixed" ? "fixed" : "percent",
      discountValue: String(c.discountValue),
      minOrderAmount: c.minOrderAmount != null ? String(c.minOrderAmount) : "",
      maxUses: c.maxUses != null ? String(c.maxUses) : "",
      active: c.active,
    });
  };

  const handleSaveEdit = () => {
    if (!edit) return;
    setEditError("");
    setSavingEdit(true);
    fetch(`/api/coupons/${edit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discountType: edit.discountType,
        discountValue: parseFloat(edit.discountValue) || 0,
        minOrderAmount: edit.minOrderAmount.trim()
          ? parseFloat(edit.minOrderAmount)
          : null,
        maxUses: edit.maxUses.trim() ? parseInt(edit.maxUses, 10) : null,
        active: edit.active,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEdit(null);
        fetchCoupons();
      })
      .catch((err) => setEditError(err.message || "Kunde inte spara"))
      .finally(() => setSavingEdit(false));
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
          <RefreshCw className="w-4 h-4" />
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
              <DashboardCouponsTableSkeleton />
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
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((c) =>
                    edit?.id === c.id ? (
                      <TableRow key={c.id}>
                        <TableCell className="align-top font-medium">
                          {c.code}
                          {editError && (
                            <p className="mt-1 text-xs font-normal text-red-600">
                              {editError}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min={1}
                              max={edit.discountType === "percent" ? 100 : undefined}
                              value={edit.discountValue}
                              onChange={(e) =>
                                setEdit({ ...edit, discountValue: e.target.value })
                              }
                              className="h-8 w-20"
                              aria-label="Rabattvärde"
                            />
                            <Select
                              value={edit.discountType}
                              onValueChange={(v) =>
                                setEdit({
                                  ...edit,
                                  discountType: v as "percent" | "fixed",
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percent">%</SelectItem>
                                <SelectItem value="fixed">kr</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={edit.minOrderAmount}
                            onChange={(e) =>
                              setEdit({ ...edit, minOrderAmount: e.target.value })
                            }
                            placeholder="—"
                            className="h-8 w-24"
                            aria-label="Minstordervärde"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={edit.maxUses}
                            onChange={(e) => setEdit({ ...edit, maxUses: e.target.value })}
                            placeholder="Obegränsat"
                            className="h-8 w-24"
                            aria-label="Max användningar"
                          />
                        </TableCell>
                        <TableCell>
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={edit.active}
                              onChange={(e) =>
                                setEdit({ ...edit, active: e.target.checked })
                              }
                              className="h-4 w-4 accent-primary"
                            />
                            Aktiv
                          </label>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={handleSaveEdit}
                              disabled={savingEdit}
                              aria-label="Spara"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => setEdit(null)}
                              disabled={savingEdit}
                              aria-label="Avbryt"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
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
                          <span
                            className={
                              c.active
                                ? "text-xs text-emerald-600"
                                : "text-xs text-muted-foreground"
                            }
                          >
                            {c.active ? "Aktiv" : "Inaktiv"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(c)}
                              aria-label={`Redigera ${c.code}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(c.id)}
                              aria-label={`Ta bort ${c.code}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
