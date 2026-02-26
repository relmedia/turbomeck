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
import { toast } from "react-toastify";

const formSchema = z.object({
  fullName: z
    .string()
    .min(2, { message: "Fullständigt namn måste vara minst 2 tecken långt!" })
    .max(50),
  email: z.string().email({ message: "Invalid email address!" }),
  phone: z.string().min(1).max(20),
  address: z.string().min(2),
  city: z.string().min(2),
});

type EditUserProps = {
  userId?: string;
  defaultValues?: {
    fullName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
  };
};

const EditUser = ({ userId, defaultValues: defaults }: EditUserProps) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: defaults?.fullName ?? "",
      email: defaults?.email ?? "",
      phone: defaults?.phone ?? "",
      address: defaults?.address ?? "",
      city: defaults?.city ?? "",
    },
  });
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!userId) {
      toast.error("Kunde inte spara – användar-ID saknas.");
      return;
    }
    try {
      const [firstName, ...lastParts] = (values.fullName || "").trim().split(" ");
      const lastName = lastParts.join(" ") || "";
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName || values.fullName,
          lastName,
          email: values.email,
          address: {
            phone: values.phone,
            address: values.address,
            city: values.city,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Användaren har uppdaterats!");
      window.location.reload();
    } catch {
      toast.error("Kunde inte spara. Försök igen.");
    }
  };

  return (
    <SheetContent>
      <SheetHeader>
        <SheetTitle className="mb-4">Redigera användare</SheetTitle>
        <SheetDescription asChild>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fullständigt namn</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      Ange användarens fullständiga namn.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-post</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      Endast administratören kan se din e-postadress.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobilnummer</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      Endast administratören kan se ditt telefonnummer.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adress</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>Fyll i adress.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ort</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>Fyll i ort.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Sparar..." : "Ändra"}
              </Button>
            </form>
          </Form>
        </SheetDescription>
      </SheetHeader>
    </SheetContent>
  );
};

export default EditUser;
