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
} from "./ui/form";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { RichTextEditor } from "./ui/rich-text-editor";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus } from "lucide-react";
import { ImageUpload } from "./ImageUpload";
import { ThumbnailsUpload } from "./ThumbnailsUpload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

const PRODUCT_SERVICE_URL = "http://localhost:8000";

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
  shortDescription: z
    .string()
    .min(1, { message: "Kort beskrivning är obligatoriskt!" })
    .max(100),
  description: z.string().min(1, { message: "Beskrivning är obligatoriskt!" }),
  price: z.coerce.number().min(0.01, {
    message: "Pris måste vara större än 0!",
  }),
  stock: z.coerce.number().min(0).default(0),
  weight: z.coerce.number().min(0).optional().nullable(),
  image: z.string().nullable().optional(),
  thumbnails: z.array(z.string()).optional().default([]),
  categoryIds: z.array(z.number()).optional().default([]),
});

type FormValues = z.infer<typeof formSchema>;

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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: "",
      shortDescription: "",
      description: "",
      price: 0,
      stock: 0,
      weight: undefined,
      image: null,
      thumbnails: [],
      categoryIds: [],
    },
  });

  const fetchCategories = useCallback(async () => {
    const res = await fetch(`${PRODUCT_SERVICE_URL}/api/categories`);
    const data = res.ok ? await res.json() : [];
    setCategories(data);
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
      const res = await fetch(`${PRODUCT_SERVICE_URL}/api/categories`, {
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

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${PRODUCT_SERVICE_URL}/api/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: values.name,
          shortDescription: values.shortDescription,
          description: values.description,
          price: values.price,
          stock: values.stock,
          weight: values.weight ?? null,
          image: values.image || null,
          thumbnails: values.thumbnails ?? [],
          categoryIds: values.categoryIds ?? [],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create product");
      }

      form.reset();
      setSelectedCategoryId("");
      setSelectedSubcategoryId("");
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
          name="shortDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kort beskrivning</FormLabel>
              <FormControl>
                <Input placeholder="Kort beskrivning..." {...field} />
              </FormControl>
              <FormDescription>Max 100 tecken</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Beskrivning</FormLabel>
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

          <FormField
            control={form.control}
            name="weight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vikt (kg) – PostNord frakt</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="t.ex. 2.5"
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value)
                      )
                    }
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
