"use client";

import { useState, useEffect } from "react";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
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
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "react-toastify";
import { PRODUCT_API } from "@/lib/product-api";

const formSchema = z.object({
  name: z.string().min(1, { message: "Namn är obligatoriskt!" }),
  nameEn: z.string().optional(),
  parentId: z.string().optional(),
});

type AddCategoryProps = {
  onSuccess?: () => void;
};

type CategoryOption = { id: number; name: string; parentId: number | null };

const AddCategory = ({ onSuccess }: AddCategoryProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", nameEn: "", parentId: "__none__" },
  });

  useEffect(() => {
    fetch(`${PRODUCT_API}/categories`)
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  const parentCategories = categories.filter((c) => c.parentId == null);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const parentId =
        values.parentId && values.parentId !== "" && values.parentId !== "__none__"
          ? parseInt(values.parentId, 10)
          : null;
      const response = await fetch(`${PRODUCT_API}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          parentId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Kunde inte skapa kategori");
      }

      form.reset();
      toast.success("Kategorin har lagts till!");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SheetContent>
      <SheetHeader>
        <SheetTitle className="mb-4">Lägg till Kategori</SheetTitle>
        <SheetDescription asChild>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Namn</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ange kategoriens namn"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Ange kategoriens namn.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nameEn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Namn (engelska)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Category name (English)"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Valfritt – visas när språk är engelska.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Huvudkategori</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ingen (huvudkategori)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">
                          Ingen (huvudkategori)
                        </SelectItem>
                        {parentCategories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Välj en huvudkategori för att skapa en underkategori.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Lägger till..." : "Lägg till"}
              </Button>
            </form>
          </Form>
        </SheetDescription>
      </SheetHeader>
    </SheetContent>
  );
};

export default AddCategory;
