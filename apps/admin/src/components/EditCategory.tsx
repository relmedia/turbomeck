"use client";

import { useState, useEffect } from "react";
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

const PRODUCT_SERVICE_URL = "http://localhost:8000";

const formSchema = z.object({
  name: z.string().min(1, { message: "Namn är obligatoriskt!" }),
  parentId: z.string().optional(),
});

export type CategoryForEdit = {
  id: number;
  name: string;
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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: category.name,
      parentId: category.parentId != null ? String(category.parentId) : "__none__",
    },
  });

  useEffect(() => {
    form.reset({
      name: category.name,
      parentId: category.parentId != null ? String(category.parentId) : "__none__",
    });
  }, [category.id, category.name, category.parentId, form]);

  const parentCategories = categories.filter(
    (c) => !c.parentId && c.id !== category.id
  );

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const parentId =
        values.parentId && values.parentId !== "" && values.parentId !== "__none__"
          ? parseInt(values.parentId, 10)
          : null;
      const response = await fetch(
        `${PRODUCT_SERVICE_URL}/api/categories/${category.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name.trim(),
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
