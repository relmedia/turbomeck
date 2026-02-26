"use client";

import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useForm } from "react-hook-form";
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
import { ScrollArea } from "./ui/scroll-area";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ImageUpload } from "./ImageUpload";
import { ThumbnailsUpload } from "./ThumbnailsUpload";
import { Checkbox } from "./ui/checkbox";

const PRODUCT_SERVICE_URL = "http://localhost:8000";

type Category = {
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

interface AddProductProps {
  onSuccess?: () => void;
}

const AddProduct = ({ onSuccess }: AddProductProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
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

  useEffect(() => {
    fetch(`${PRODUCT_SERVICE_URL}/api/categories`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

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
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SheetContent>
      <ScrollArea className="h-screen">
        <SheetHeader>
          <SheetTitle className="mb-4">Lägg till Produkt</SheetTitle>
          <SheetDescription asChild>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-20">
                {error && (
                  <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
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
                            {...field}
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
                      <ScrollArea className="h-28 rounded-md border p-3">
                        <div className="flex flex-col gap-2">
                          {categories.map((c) => (
                            <label
                              key={c.id}
                              className="flex items-center gap-2 cursor-pointer text-sm"
                            >
                              <Checkbox
                                checked={field.value.includes(c.id)}
                                onCheckedChange={(checked) => {
                                  field.onChange(
                                    checked
                                      ? [...field.value, c.id]
                                      : field.value.filter((id) => id !== c.id)
                                  );
                                }}
                              />
                              {categoryDisplayName(c)}
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Skapar produkt...
                    </>
                  ) : (
                    "Lägg till produkt"
                  )}
                </Button>
              </form>
            </Form>
          </SheetDescription>
        </SheetHeader>
      </ScrollArea>
    </SheetContent>
  );
};

export default AddProduct;
