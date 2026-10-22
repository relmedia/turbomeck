"use client";

import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { RichTextEditor } from "@repo/ui/components/rich-text-editor";
import { useState, useEffect, useCallback } from "react";
import { ShipmentSection } from "@/components/ShipmentSection";
import { Loader2, Plus, Languages, Sparkles } from "lucide-react";
import { ImageUpload } from "./ImageUpload";
import { ThumbnailsUpload } from "./ThumbnailsUpload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Badge } from "@repo/ui/components/badge";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { PRODUCT_API } from "@/lib/product-api";
import {
  productDescriptionText,
  shortDescriptionFromFull,
} from "@/lib/product-description";

export type Category = {
  id: number;
  name: string;
  parentId?: number | null;
  parentName?: string | null;
};

function categoryDisplayName(c: Category): string {
  return c.parentName ? `${c.parentName} › ${c.name}` : c.name;
}

const formSchema = z.object({
  name: z.string().min(1, { message: "Produkt namn är obligatoriskt!" }),
  description: z.string().min(1, { message: "Beskrivning är obligatoriskt!" }),
  nameEn: z.string().optional(),
  descriptionEn: z.string().optional(),
  price: z.coerce.number().min(0.01, {
    message: "Pris måste vara större än 0!",
  }),
  stock: z.coerce.number().min(0).default(0),
  weight: z.coerce.number().min(0).optional().nullable(),
  shipmentType: z.enum(["light", "heavy"]).default("heavy"),
  lengthCm: z.coerce.number().int().min(0).optional().nullable(),
  widthCm: z.coerce.number().int().min(0).optional().nullable(),
  heightCm: z.coerce.number().int().min(0).optional().nullable(),
  image: z.string().nullable().optional(),
  thumbnails: z.array(z.string()).optional().default([]),
  categoryIds: z.array(z.number()).optional().default([]),
  isExchangeTurbo: z.boolean().optional().default(false),
});

type FormValues = z.infer<typeof formSchema>;

/** One row in the "Specifikationer" table on the product page. */
type SpecRow = { group?: string; label: string; value: string };

const SPEC_GROUPS = ["Kompressor", "Turbin", "Anslutningar", "Övrigt"];

interface AddProductFormProps {
  onSuccess?: () => void;
}

export function AddProductForm({ onSuccess }: AddProductFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>("");
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addSubcategoryOpen, setAddSubcategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSuggestingDescription, setIsSuggestingDescription] = useState(false);
  const [isSuggestingSpecs, setIsSuggestingSpecs] = useState(false);
  const [specifications, setSpecifications] = useState<SpecRow[]>([]);
  /** Sources and caveats from the last AI spec lookup, shown under the editor. */
  const [specSuggestion, setSpecSuggestion] = useState<{
    sources: string[];
    notes: string;
    weightBasis: string;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: "",
      description: "",
      nameEn: "",
      descriptionEn: "",
      price: 0,
      stock: 0,
      weight: undefined,
      shipmentType: "heavy",
      lengthCm: undefined,
      widthCm: undefined,
      heightCm: undefined,
      image: null,
      thumbnails: [],
      categoryIds: [],
      isExchangeTurbo: false,
    },
  });

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${PRODUCT_API}/categories`);
      const raw: unknown = res.ok ? await res.json().catch(() => null) : null;
      setCategories(Array.isArray(raw) ? raw : []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreateCategory = async (
    parentId: number | null,
    onAdd: (id: number) => void
  ) => {
    if (!newCategoryName.trim()) return;
    if (parentId !== null && (typeof parentId !== "number" || isNaN(parentId)))
      return;
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
      onAdd(created.id);
      setNewCategoryName("");
      setAddCategoryOpen(false);
      setAddSubcategoryOpen(false);
      if (parentId != null) setSelectedCategoryId(String(parentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleTranslate = async () => {
    const name = form.getValues("name");
    const description = form.getValues("description");
    if (!name?.trim() && !description?.trim()) {
      setError("Fyll i namn eller beskrivning först.");
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
          description: description || "",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Översättning misslyckades");
      }
      const data = await res.json();
      form.setValue("nameEn", data.nameEn || "");
      form.setValue("descriptionEn", data.descriptionEn || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSuggestSpecifications = async () => {
    const name = form.getValues("name")?.trim();
    const description = form.getValues("description")?.trim();
    if (!name && !description) {
      setError("Fyll i produktnamn eller beskrivning först — AI använder dem som underlag.");
      return;
    }
    setIsSuggestingSpecs(true);
    setError(null);
    try {
      const res = await fetch("/api/suggest-specifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error?.trim() || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        specifications: SpecRow[];
        weightKg: number | null;
        weightBasis: string;
        sources: string[];
        notes: string;
      };

      // Never clobber rows already written - only append unseen labels.
      setSpecifications((prev) => {
        const existingLabels = new Set(prev.map((r) => r.label.trim().toLowerCase()));
        return [
          ...prev,
          ...data.specifications.filter(
            (r) => !existingLabels.has(r.label.trim().toLowerCase())
          ),
        ];
      });

      // Same for the weight: a value already entered wins over the suggestion.
      const currentWeight = form.getValues("weight");
      if (data.weightKg != null && (currentWeight == null || Number.isNaN(currentWeight))) {
        form.setValue("weight", data.weightKg);
      }

      setSpecSuggestion({
        sources: data.sources,
        notes: data.notes,
        weightBasis: data.weightKg != null ? data.weightBasis : "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setIsSuggestingSpecs(false);
    }
  };

  const handleSuggestDescription = async () => {
    const name = form.getValues("name");
    const description = productDescriptionText(form.getValues("description"));
    if (!description) {
      setError("Fyll i fullständig beskrivning först — AI använder den som underlag.");
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
          description: description.slice(0, 4000),
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
      form.setValue("description", data.description || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setIsSuggestingDescription(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${PRODUCT_API}/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: values.name,
          shortDescription: shortDescriptionFromFull(values.description),
          description: values.description,
          nameEn: values.nameEn || undefined,
          shortDescriptionEn: shortDescriptionFromFull(values.descriptionEn),
          descriptionEn: values.descriptionEn || undefined,
          price: values.price,
          stock: values.stock,
          weight: values.weight ?? null,
          shipmentType: values.shipmentType,
          lengthCm: values.lengthCm ?? null,
          widthCm: values.widthCm ?? null,
          heightCm: values.heightCm ?? null,
          image: values.image || null,
          thumbnails: values.thumbnails ?? [],
          categoryIds: values.categoryIds ?? [],
          specifications: specifications.filter(
            (r) => r.label.trim() !== "" && r.value.trim() !== ""
          ),
        }),
      });

      if (!response.ok) {
        // Surface what the server actually said. This used to throw a fixed
        // "Failed to create product", so a validation message the API had
        // already written in Swedish never reached the person who could act
        // on it.
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        throw new Error(
          payload.error
            ? payload.detail
              ? `${payload.error} (${payload.detail})`
              : payload.error
            : `Kunde inte skapa produkten (HTTP ${response.status})`,
        );
      }

      form.reset();
      setSelectedCategoryId("");
      setSelectedSubcategoryId("");
      setSpecifications([]);
      setSpecSuggestion(null);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="rounded-md bg-red-100 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <FormField
          control={form.control}
          name="image"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <ImageUpload
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="thumbnails"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <ThumbnailsUpload
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Namn</FormLabel>
              <FormControl>
                <Input placeholder="Produkt namn..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <FormLabel className="mb-0">Fullständig beskrivning</FormLabel>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSuggestDescription}
                  disabled={isSubmitting || isSuggestingDescription}
                >
                  {isSuggestingDescription ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {isSuggestingDescription
                    ? "Skapar förslag..."
                    : "Förslag utifrån beskrivning"}
                </Button>
              </div>
              <FormDescription>
                AI kan utveckla texten utifrån namn och beskrivning — granska alltid innan publicering.
                Korttexten på produktkorten genereras automatiskt från denna beskrivning.
              </FormDescription>
              <FormControl>
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Fullständig beskrivning..."
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
            <FormField
              control={form.control}
              name="nameEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Namn (engelska)</FormLabel>
                  <FormControl>
                    <Input placeholder="Product name (English)..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="descriptionEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beskrivning (engelska)</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Full description (English)..."
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pris (kr)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stock"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lager</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Shipment details — same component the product edit page uses, so the
              two forms cannot drift. Weight lives here now rather than beside
              Lager; it is a shipping input, not a stock one. */}
          <div className="md:col-span-2">
            <ShipmentSection
              value={{
                shipmentType: form.watch("shipmentType") ?? "heavy",
                weight: form.watch("weight") != null ? String(form.watch("weight")) : "",
                lengthCm: form.watch("lengthCm") != null ? String(form.watch("lengthCm")) : "",
                widthCm: form.watch("widthCm") != null ? String(form.watch("widthCm")) : "",
                heightCm: form.watch("heightCm") != null ? String(form.watch("heightCm")) : "",
              }}
              onChange={(patch) => {
                if (patch.shipmentType !== undefined) {
                  form.setValue("shipmentType", patch.shipmentType, { shouldDirty: true });
                }
                for (const key of ["weight", "lengthCm", "widthCm", "heightCm"] as const) {
                  const raw = patch[key];
                  if (raw === undefined) continue;
                  const trimmed = raw.trim();
                  form.setValue(
                    key,
                    trimmed === "" || !Number.isFinite(Number(trimmed))
                      ? undefined
                      : Number(trimmed),
                    { shouldDirty: true },
                  );
                }
              }}
              product={{
                name: form.watch("name") ?? "",
                shortDescription: shortDescriptionFromFull(form.watch("description")),
                description: form.watch("description") ?? "",
                specifications: specifications
                  .filter((r) => r.label.trim() !== "" && r.value.trim() !== "")
                  .map((r) => ({ label: r.label, value: r.value })),
              }}
            />
          </div>

        </div>

        <FormField
          control={form.control}
          name="categoryIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kategorier</FormLabel>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedCategoryId}
                    onValueChange={(v) => {
                      setSelectedCategoryId(v);
                      setSelectedSubcategoryId("");
                      const id = parseInt(v, 10);
                      if (id && !field.value.includes(id)) {
                        field.onChange([...field.value, id]);
                      }
                    }}
                  >
                    <SelectTrigger className="min-w-0 flex-1">
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
                              className="h-9 w-9 shrink-0 rounded-full"
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
                                onChange={(e) =>
                                  setNewCategoryName(e.target.value)
                                }
                              />
                              <Button
                                size="sm"
                                className="w-full"
                                disabled={
                                  !newCategoryName.trim() || creatingCategory
                                }
                                onClick={() =>
                                  handleCreateCategory(null, (id) => {
                                    if (!field.value.includes(id)) {
                                      field.onChange([
                                        ...field.value,
                                        id,
                                      ]);
                                    }
                                  })
                                }
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
                      if (id && !field.value.includes(id)) {
                        field.onChange([...field.value, id]);
                      }
                    }}
                  >
                    <SelectTrigger className="min-w-0 flex-1">
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
                              className="h-9 w-9 shrink-0 rounded-full"
                              disabled={!selectedCategoryId}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64" align="end">
                            <div className="space-y-3">
                              <p className="text-sm font-medium">
                                Ny underkategori
                              </p>
                              <Input
                                placeholder="Underkategorinamn"
                                value={newCategoryName}
                                onChange={(e) =>
                                  setNewCategoryName(e.target.value)
                                }
                              />
                              <Button
                                size="sm"
                                className="w-full"
                                disabled={
                                  !newCategoryName.trim() || creatingCategory
                                }
                                onClick={() =>
                                  handleCreateCategory(
                                    parseInt(selectedCategoryId, 10),
                                    (id) => {
                                      if (!field.value.includes(id)) {
                                        field.onChange([
                                          ...field.value,
                                          id,
                                        ]);
                                      }
                                    }
                                  )
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
                {field.value.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {field.value.map((id) => {
                      const c = categories.find((x) => x.id === id);
                      return c ? (
                        <Badge
                          key={id}
                          variant="secondary"
                          className="cursor-pointer pr-1"
                          onClick={() => {
                            field.onChange(
                              field.value.filter((x) => x !== id)
                            );
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
                      onClick={() => field.onChange([])}
                    >
                      Rensa alla
                    </Button>
                  </div>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium">Kärnretur (endast Sverige i kassan)</p>
          <FormField
            control={form.control}
            name="isExchangeTurbo"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="cursor-pointer">Detta är en utbytes turbo</FormLabel>
                  <FormDescription>
                    I kassan visas då valet kärnretur vs. kärnavgift när leveransland är Sverige. Lämna avmarkerat
                    för övriga produkter (t.ex. tillbehör eller ny turbo utan kärnbyte).
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>

        <div className="border-t pt-4 mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-medium">Specifikationer (valfritt)</h3>
              <p className="text-sm text-muted-foreground">
                Visas i fliken Specifikationer på produktsidan. AI läser produkttexten och söker
                på webben, fyller i vikten om den är tom och rör aldrig rader du redan skrivit —
                granska alltid innan du sparar.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSuggestSpecifications}
              disabled={isSubmitting || isSuggestingSpecs}
              className="shrink-0"
            >
              {isSuggestingSpecs ? (
                <Loader2 className="h-4 w-4 mr-2 shrink-0 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {isSuggestingSpecs ? "Söker..." : "Hämta med AI"}
            </Button>
          </div>

          <datalist id="add-spec-groups">
            {SPEC_GROUPS.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          {specifications.length > 0 && (
            <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[10rem_12rem_1fr_2.5rem]">
              <span>Grupp</span>
              <span>Etikett</span>
              <span>Värde</span>
              <span />
            </div>
          )}
          {specifications.map((row, idx) => (
            <div
              key={idx}
              className="grid gap-2 sm:grid-cols-[10rem_12rem_1fr_2.5rem] sm:items-center"
            >
              <Input
                list="add-spec-groups"
                placeholder="Kompressor"
                value={row.group ?? ""}
                onChange={(e) =>
                  setSpecifications((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx]!, group: e.target.value };
                    return next;
                  })
                }
              />
              <Input
                placeholder="Kompressorhjul"
                value={row.label}
                onChange={(e) =>
                  setSpecifications((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx]!, label: e.target.value };
                    return next;
                  })
                }
              />
              <Input
                placeholder="48,5 × 61 mm"
                value={row.value}
                onChange={(e) =>
                  setSpecifications((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx]!, value: e.target.value };
                    return next;
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive"
                aria-label="Ta bort rad"
                onClick={() =>
                  setSpecifications((prev) => prev.filter((_, i) => i !== idx))
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
              setSpecifications((prev) => [...prev, { group: "", label: "", value: "" }])
            }
          >
            <Plus className="w-4 h-4 mr-2" />
            Lägg till rad
          </Button>

          {specSuggestion && (
            <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              {specSuggestion.notes && <p>{specSuggestion.notes}</p>}
              {specSuggestion.weightBasis && <p>Vikt: {specSuggestion.weightBasis}</p>}
              {specSuggestion.sources.length > 0 ? (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Källor</p>
                  <ul className="space-y-0.5">
                    {specSuggestion.sources.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all underline hover:text-foreground"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>Inga webbkällor — värdena kommer från produkttexten.</p>
              )}
            </div>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Skapar produkt...
            </>
          ) : (
            "Lägg till produkt"
          )}
        </Button>
      </form>
    </Form>
  );
}
