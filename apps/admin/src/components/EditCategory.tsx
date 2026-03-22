"use client";

import { useState, useEffect } from "react";
import { Languages, Loader2 } from "lucide-react";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { toast } from "react-toastify";
import { PRODUCT_API } from "@/lib/product-api";

const formSchema = z.object({
  name: z.string().min(1, { message: "Namn är obligatoriskt!" }),
  nameEn: z.string().optional(),
  parentId: z.string().optional(),
});

export type CategoryForEdit = {
  id: number;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  parentId?: number | null;
  parentName?: string | null;
};

type EditCategoryProps = {
  category: CategoryForEdit;
  categories: CategoryForEdit[];
  onSuccess?: () => void;
  onClose?: () => void;
};

const EditCategory = ({
  category,
  categories,
  onSuccess,
  onClose,
}: EditCategoryProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: category.name,
      nameEn: category.nameEn ?? "",
      parentId: category.parentId != null ? String(category.parentId) : "__none__",
    },
  });

  useEffect(() => {
    form.reset({
      name: category.name,
      nameEn: category.nameEn ?? "",
      parentId: category.parentId != null ? String(category.parentId) : "__none__",
    });
  }, [category.id, category.name, category.nameEn, category.parentId, form]);

  const parentCategories = (categories ?? []).filter(
    (c) => !c.parentId && c.id !== category.id
  );

  const handleTranslate = async () => {
    const name = form.getValues("name");
    if (!name?.trim()) {
      toast.error("Fyll i det svenska namnet först.");
      return;
    }
    setIsTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shortDescription: "", description: "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Översättning misslyckades");
      }
      const data = await res.json();
      form.setValue("nameEn", data.nameEn || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setIsTranslating(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const parentId =
        values.parentId && values.parentId !== "" && values.parentId !== "__none__"
          ? parseInt(values.parentId, 10)
          : null;
      const response = await fetch(
        `${PRODUCT_API}/categories/${category.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name.trim(),
            nameEn: values.nameEn?.trim() || null,
            parentId,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Kunde inte uppdatera kategori");
      }

      toast.success("Kategorin har uppdaterats!");
      onClose?.();
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
        <SheetTitle className="mb-4">Redigera kategori</SheetTitle>
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
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nameEn"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-2">
                    <FormLabel>Namn (engelska)</FormLabel>
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
                  <FormControl>
                    <Input
                      placeholder="Category name (English)"
                      {...field}
                    />
                  </FormControl>
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
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sparar..." : "Spara"}
            </Button>
          </form>
        </Form>
      </SheetHeader>
    </SheetContent>
  );
};

export default EditCategory;
