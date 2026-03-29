"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, RefreshCw, Trash2, Plus, Languages, Loader2, Sparkles } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImageUpload } from "@/components/ImageUpload";
import { ThumbnailsUpload } from "@/components/ThumbnailsUpload";
import { toast } from "react-toastify";
import { PRODUCT_API } from "@/lib/product-api";

type Category = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

function categoryDisplayName(c: Category): string {
  return c.parentName ? `${c.parentName} › ${c.name}` : c.name;
}

type Product = {
  id: number;
  name: string;
  shortDescription: string;
  description: string;
  price: number;
  image: string | null;
  thumbnails: string[];
  stock: number;
  weight: number | null;
  categoryIds: number[];
  isExchangeTurbo?: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>("");
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addSubcategoryOpen, setAddSubcategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSuggestingDescription, setIsSuggestingDescription] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    shortDescription: string;
    description: string;
    nameEn: string;
    shortDescriptionEn: string;
    descriptionEn: string;
    price: string;
    stock: string;
    weight: string;
    categoryIds: number[];
    attributes: { name: string; options: string[] }[];
    image: string | null;
    thumbnails: string[];
    isExchangeTurbo: boolean;
  }>({
    name: "",
    shortDescription: "",
    description: "",
    nameEn: "",
    shortDescriptionEn: "",
    descriptionEn: "",
    price: "",
    stock: "",
    weight: "",
    categoryIds: [],
    attributes: [],
    image: null,
    thumbnails: [],
    isExchangeTurbo: false,
  });

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productRes, categoriesRes] = await Promise.all([
        fetch(`${PRODUCT_API}/products/${productId}`),
        fetch(`${PRODUCT_API}/categories`),
      ]);
      if (!productRes.ok) {
        throw new Error("Product not found");
      }
      const data = await productRes.json();
      const cats: Category[] = categoriesRes.ok ? await categoriesRes.json() : [];
      setProduct(data);
      setCategories(cats);
      setFormData({
        name: data.name || "",
        shortDescription: data.shortDescription || "",
        description: data.description || "",
        nameEn: data.nameEn || "",
        shortDescriptionEn: data.shortDescriptionEn || "",
        descriptionEn: data.descriptionEn || "",
        price: data.price?.toString() || "",
        stock: data.stock?.toString() || "0",
        weight: data.weight != null ? data.weight.toString() : "",
        categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds : [],
        attributes: Array.isArray(data.attributes)
          ? data.attributes.filter((a: { name?: string; options?: string[] }) => a?.name && Array.isArray(a?.options))
          : [],
        image: data.image || null,
        thumbnails: data.thumbnails ?? [],
        isExchangeTurbo: data.isExchangeTurbo === true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${PRODUCT_API}/categories`);
      if (res.ok) {
        const cats: Category[] = await res.json();
        setCategories(cats);
      }
    } catch (err) {
      console.error("Failed to fetch categories", err);
    }
  }, []);

  useEffect(() => {
    if (productId) {
      fetchProduct();
    }
  }, [productId, fetchProduct]);

  const handleCreateCategory = async (parentId: number | null) => {
    if (!newCategoryName.trim()) return;
    if (parentId !== null && (typeof parentId !== "number" || isNaN(parentId))) return;
    setCreatingCategory(true);
    try {
      const res = await fetch(`${PRODUCT_API}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim(), parentId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Kunde inte skapa kategori");
      }
      const created = await res.json();
      await fetchCategories();
      setFormData((prev) => ({
        ...prev,
        categoryIds: [...prev.categoryIds, created.id],
      }));
      setNewCategoryName("");
      setAddCategoryOpen(false);
      setAddSubcategoryOpen(false);
      if (parentId) setSelectedCategoryId(String(parentId));
      toast.success("Kategorin har skapats!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleTranslate = async () => {
    const name = formData.name?.trim();
    const shortDescription = formData.shortDescription?.trim();
    const description = formData.description?.trim();
    if (!name && !shortDescription && !description) {
      toast.error("Fyll i namn, kort beskrivning eller beskrivning först.");
      return;
    }
    setIsTranslating(true);
    setError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "",
          shortDescription: shortDescription || "",
          description: description || "",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Översättning misslyckades");
      }
      const data = await res.json();
      setFormData((prev) => ({
        ...prev,
        nameEn: data.nameEn || "",
        shortDescriptionEn: data.shortDescriptionEn || "",
        descriptionEn: data.descriptionEn || "",
      }));
      toast.success("Översättning klar!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ett fel uppstod";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSuggestDescription = async () => {
    const name = formData.name?.trim();
    const shortDescription = formData.shortDescription?.trim();
    if (!shortDescription) {
      toast.error("Fyll i kort beskrivning först — AI använder den som underlag.");
      return;
    }
    setIsSuggestingDescription(true);
    setError(null);
    try {
      const res = await fetch("/api/suggest-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "",
          shortDescription,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg: string;
        try {
          const data = JSON.parse(text) as { error?: string };
          msg = data.error?.trim() || "";
        } catch {
          msg = "";
        }
        if (!msg) {
          const preview = text.replace(/\s+/g, " ").trim().slice(0, 400);
          msg = preview
            ? `HTTP ${res.status}: ${preview}`
            : `HTTP ${res.status} — inget felmeddelande från servern. Kolla terminalen där admin körs.`;
        }
        throw new Error(msg);
      }
      const data = await res.json();
      setFormData((prev) => ({ ...prev, description: data.description || "" }));
      toast.success("Förslag infogat — granska texten innan du sparar.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ett fel uppstod";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSuggestingDescription(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (url: string | null) => {
    setFormData((prev) => ({ ...prev, image: url }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`${PRODUCT_API}/products/${productId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: String(formData.name ?? ""),
          shortDescription: String(formData.shortDescription ?? ""),
          description: String(formData.description ?? ""),
          nameEn: formData.nameEn?.trim() || null,
          shortDescriptionEn: formData.shortDescriptionEn?.trim() || null,
          descriptionEn: formData.descriptionEn?.trim() || null,
          price: Number(formData.price) || 0,
          stock: Number(formData.stock) || 0,
          weight: formData.weight ? Number(formData.weight) : null,
          categoryIds: Array.isArray(formData.categoryIds) ? formData.categoryIds : [],
          attributes: Array.isArray(formData.attributes) ? formData.attributes : [],
          image: formData.image ?? null,
          thumbnails: Array.isArray(formData.thumbnails) ? formData.thumbnails : [],
          isExchangeTurbo: formData.isExchangeTurbo === true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData?.error || errData?.message || `Failed to update product (${response.status})`;
        throw new Error(msg);
      }

      const updatedProduct = await response.json();
      setProduct(updatedProduct);
      toast.success("Produkten har sparats!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`${PRODUCT_API}/products/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete product");
      }

      router.push("/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/products">Produkter</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Produkt hittades inte</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/products">Produkter</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {formData.name || product?.name || "Redigera produkt"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6 border-b border-border">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            {formData.name || "Redigera produkt"}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchProduct}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Uppdatera
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={deleting} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Ta bort
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Är du säker?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Du håller på att ta bort produkten <strong>&quot;{product?.name}&quot;</strong>.
                    Denna åtgärd kan inte ångras.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {deleting ? "Raderar..." : "Ta bort"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Sparar..." : "Spara"}
            </Button>
          </div>
          </div>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="p-4 bg-red-100 text-red-700 rounded-md">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Produktinformation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Produktnamn</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name ?? ""}
                  onChange={handleInputChange}
                  placeholder="Ange produktnamn"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shortDescription">Kort beskrivning</Label>
                <Input
                  id="shortDescription"
                  name="shortDescription"
                  value={formData.shortDescription ?? ""}
                  onChange={handleInputChange}
                  placeholder="Kort beskrivning för produktlistan"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label htmlFor="description" className="mb-0">
                    Fullständig beskrivning
                  </Label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleSuggestDescription}
                    disabled={saving || isSuggestingDescription}
                  >
                    {isSuggestingDescription ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {isSuggestingDescription
                      ? "Skapar förslag..."
                      : "Förslag från kort beskrivning"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  AI kan fylla i en utökad text utifrån namn och kort beskrivning — granska alltid innan publicering.
                </p>
                <RichTextEditor
                  id="description"
                  value={formData.description}
                  onChange={(html) => {
                    setFormData((prev) => ({ ...prev, description: html }));
                  }}
                  placeholder="Detaljerad produktbeskrivning"
                  disabled={saving}
                />
              </div>

              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Engelska översättningar (valfritt)</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTranslate}
                    disabled={isTranslating}
                  >
                    {isTranslating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Languages className="h-4 w-4 mr-2" />
                    )}
                    {isTranslating ? "Översätter..." : "Översätt med AI"}
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nameEn">Namn (engelska)</Label>
                    <Input
                      id="nameEn"
                      name="nameEn"
                      value={formData.nameEn}
                      onChange={handleInputChange}
                      placeholder="Product name (English)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shortDescriptionEn">Kort beskrivning (engelska)</Label>
                    <Input
                      id="shortDescriptionEn"
                      name="shortDescriptionEn"
                      value={formData.shortDescriptionEn ?? ""}
                      onChange={handleInputChange}
                      placeholder="Short description (English)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descriptionEn">Fullständig beskrivning (engelska)</Label>
                    <RichTextEditor
                      id="descriptionEn"
                      value={formData.descriptionEn ?? ""}
                      onChange={(html) => {
                        setFormData((prev) => ({ ...prev, descriptionEn: html }));
                      }}
                      placeholder="Full description (English)"
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produktalternativ</CardTitle>
              <p className="text-sm text-muted-foreground">
                Kunden måste välja ett alternativ vid köp. Lägg till alternativ (kommaseparerade, t.ex. 13C, 13T, 14t, 15t).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.attributes.map((attr, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <Input
                    placeholder="13C, 13T, 14t, 15t..."
                    value={attr.options.join(", ")}
                    onChange={(e) =>
                      setFormData((prev) => {
                        const next = [...prev.attributes];
                        const prevAttr = next[idx];
                        next[idx] = {
                          name: prevAttr?.name ?? "",
                          options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        };
                        return { ...prev, attributes: next };
                      })
                    }
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        attributes: prev.attributes.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    attributes: [...prev.attributes, { name: "Alternativ", options: [] }],
                  }))
                }
              >
                <Plus className="w-4 h-4 mr-2" />
                Lägg till alternativ
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pris & Lager</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Pris (SEK)</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    step="0.01"
                    value={formData.price ?? ""}
                    onChange={handleInputChange}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock">Lager</Label>
                  <Input
                    id="stock"
                    name="stock"
                    type="number"
                    value={formData.stock ?? ""}
                    onChange={handleInputChange}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Vikt (kg) – för PostNord frakt</Label>
                  <Input
                    id="weight"
                    name="weight"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.weight ?? ""}
                    onChange={handleInputChange}
                    placeholder="t.ex. 2.5"
                  />
                </div>
                <div className="space-y-4 col-span-2">
                  <Label>Kategorier</Label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedCategoryId}
                        onValueChange={(v) => {
                          setSelectedCategoryId(v);
                          setSelectedSubcategoryId("");
                          const id = parseInt(v, 10);
                          if (id && !formData.categoryIds.includes(id)) {
                            setFormData((prev) => ({
                              ...prev,
                              categoryIds: [...prev.categoryIds, id],
                            }));
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1 min-w-0">
                          <SelectValue placeholder="Välj kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories
                            .filter((c) => !c.parentId)
                            .map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Popover
                              open={addCategoryOpen}
                              onOpenChange={(o) => {
                                setAddCategoryOpen(o);
                                if (!o) setNewCategoryName("");
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="shrink-0 h-9 w-9 rounded-full"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                        <PopoverContent className="w-64" align="end">
                          <div className="space-y-3">
                            <p className="text-sm font-medium">Ny kategori</p>
                            <Input
                              placeholder="Kategorinamn"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                            />
                            <Button
                              size="sm"
                              className="w-full"
                              disabled={!newCategoryName.trim() || creatingCategory}
                              onClick={() => handleCreateCategory(null)}
                            >
                              {creatingCategory ? "Skapar..." : "Skapa"}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Lägg till ny kategori</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedSubcategoryId}
                        onValueChange={(v) => {
                          setSelectedSubcategoryId(v);
                          const id = parseInt(v, 10);
                          if (id && !formData.categoryIds.includes(id)) {
                            setFormData((prev) => ({
                              ...prev,
                              categoryIds: [...prev.categoryIds, id],
                            }));
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1 min-w-0">
                          <SelectValue placeholder="Välj underkategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories
                            .filter(
                              (c) =>
                                c.parentId != null &&
                                c.parentId === parseInt(selectedCategoryId, 10)
                            )
                            .map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Popover
                              open={addSubcategoryOpen}
                              onOpenChange={(o) => {
                                setAddSubcategoryOpen(o);
                                if (!o) setNewCategoryName("");
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="shrink-0 h-9 w-9 rounded-full"
                                  disabled={!selectedCategoryId}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                        <PopoverContent className="w-64" align="end">
                          <div className="space-y-3">
                            <p className="text-sm font-medium">Ny underkategori</p>
                            <Input
                              placeholder="Underkategorinamn"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                            />
                            <Button
                              size="sm"
                              className="w-full"
                              disabled={!newCategoryName.trim() || creatingCategory}
                              onClick={() =>
                                handleCreateCategory(parseInt(selectedCategoryId, 10))
                              }
                            >
                              {creatingCategory ? "Skapar..." : "Skapa"}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {selectedCategoryId
                            ? "Lägg till underkategori"
                            : "Välj en huvudkategori först"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  {formData.categoryIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {formData.categoryIds.map((id) => {
                        const c = categories.find((x) => x.id === id);
                        return c ? (
                          <Badge
                            key={id}
                            variant="secondary"
                            className="pr-1 cursor-pointer"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                categoryIds: prev.categoryIds.filter(
                                  (x) => x !== id
                                ),
                              }));
                            }}
                          >
                            {categoryDisplayName(c)}
                            <span className="ml-1 hover:text-destructive">×</span>
                          </Badge>
                        ) : null;
                      })}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, categoryIds: [] }))
                        }
                      >
                        Rensa alla
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Produktbild</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ImageUpload
                value={formData.image}
                onChange={handleImageChange}
                disabled={saving}
              />
              <ThumbnailsUpload
                value={formData.thumbnails}
                onChange={(thumbnails) =>
                  setFormData((prev) => ({ ...prev, thumbnails }))
                }
                disabled={saving}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kärnretur (kassan)</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer">
                <Checkbox
                  checked={formData.isExchangeTurbo}
                  onCheckedChange={(v) =>
                    setFormData((prev) => ({ ...prev, isExchangeTurbo: v === true }))
                  }
                />
                <div className="space-y-1 text-sm leading-snug">
                  <span className="font-medium">Utbytes</span>
                  <p className="text-muted-foreground">
                    Visas för svenska kunder (geolokation/leveransland) i kassan. Avmarkera för tillbehör eller
                    turbo utan kärnbyte.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono">{product?.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kategorier</span>
                <span>
                  {formData.categoryIds.length > 0
                    ? formData.categoryIds
                        .map((id) => {
                          const c = categories.find((x) => x.id === id);
                          return c ? categoryDisplayName(c) : String(id);
                        })
                        .join(", ")
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Utbytes</span>
                <span>{formData.isExchangeTurbo ? "Ja" : "Nej"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Skapad</span>
                <span>
                  {product?.createdAt
                    ? new Date(product.createdAt).toLocaleDateString("sv-SE")
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uppdaterad</span>
                <span>
                  {product?.updatedAt
                    ? new Date(product.updatedAt).toLocaleDateString("sv-SE")
                    : "-"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
