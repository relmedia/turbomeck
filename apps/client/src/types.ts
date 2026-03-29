import { z } from "zod";

export type ProductType = {
  id: string | number;
  /** Canonical slug from Swedish name - use for product URLs to avoid 404 when translated */
  slug?: string;
  name: string;
  shortDescription: string;
  description: string;
  price: number;
  /** Weight in kg for PostNord shipping calculation */
  weight?: number;
  /** Category ids for filtering (product can belong to multiple categories) */
  categoryIds?: number[];
  sizes: [string, ...string[]];
  colors: [string, ...string[]];
  /** Product variants e.g. [{ name: "Typ", options: ["13C","13T"] }] - customer must choose when adding to cart */
  attributes?: { name: string; options: string[] }[];
  /** Set in admin for exchange (utbytes) turbos — Sweden core-return rules apply in checkout */
  isExchangeTurbo?: boolean;
  images: Record<string, string>;
  /** All images for gallery (main + thumbnails) */
  galleryImages?: string[];
};

export type ProductsType = ProductType[];

export type CartItemType = ProductType & {
  quantity: number;
  selectedSize: string;
  selectedColor: string;
  /** Selected variant e.g. "Typ: 13C" when product has attributes */
  selectedVariant?: string;
};

export type CartItemsType = CartItemType[];

export type PostNordServicePoint = {
  servicePointId: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  countryCode: string;
  openingHours?: string;
  distance?: number;
};

export const EUROPEAN_COUNTRY_CODES = [
  "SE", "NO", "DK", "FI", "DE", "NL", "BE", "FR", "ES", "IT", "AT", "CH",
  "PL", "CZ", "IE", "GB", "PT", "GR", "HU", "RO", "BG", "HR", "SK", "SI",
  "EE", "LV", "LT", "LU", "MT", "CY", "IS",
] as const;

export const shippingFormSchema = z.object({
  firstName: z.string().min(1, "Förnamn krävs!"),
  lastName: z.string().min(1, "Efternamn krävs!"),
  email: z
    .string()
    .regex(
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      "Ogiltig e-postadress format!"
    )
    .min(1, "Email krävs!"),
  phone: z
    .string()
    .min(10, "Telefonnummer måste vara giltigt (minst 10 siffror med landskod)!")
    .regex(/^\+\d{10,15}$/, "Ange ett giltigt europeiskt telefonnummer (t.ex. +46709165006)"),
  country: z
    .string()
    .refine((v) => EUROPEAN_COUNTRY_CODES.includes(v as (typeof EUROPEAN_COUNTRY_CODES)[number]), "Välj ett europeiskt land"),
  address: z.string().min(1, "Adress krävs!"),
  city: z.string().min(1, "Ort krävs!"),
  postalCode: z
    .string()
    .min(4, "Postnummer krävs, minst 4 siffror!")
    .regex(/^\d+$/, "Endast siffror är tillåtna!"),
  deliveryOption: z.enum(["home", "servicepoint"]).optional(),
  servicePoint: z
    .object({
      servicePointId: z.string(),
      name: z.string(),
      address: z.string(),
      postalCode: z.string(),
      city: z.string(),
      countryCode: z.string(),
      openingHours: z.string().optional(),
      distance: z.number().optional(),
    })
    .optional(),
});

export type ShippingFormInputs = z.infer<typeof shippingFormSchema>;

/** Saved address stored in Clerk publicMetadata (no deliveryOption/servicePoint) */
export type SavedAddress = Pick<
  ShippingFormInputs,
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "country"
  | "address"
  | "city"
  | "postalCode"
>;

export const paymentFormSchema = z.object({
  cardHolder: z.string().min(1, "Namn på kortinnehavare krävs!"),
  cardNumber: z
    .string()
    .refine((val) => /^\d{16}$/.test(val.replace(/\D/g, "")), "Kortnummer måste vara 16 siffror"),
  expirationDate: z
    .string()
    .min(1, "Utgångsdatum krävs")
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Ogiltigt format (MM/ÅÅ)")
    .refine((val) => {
      const [month, year] = val.split("/");
      if (!month || !year) return false;
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear() % 100; // Get last 2 digits
      const currentMonth = currentDate.getMonth() + 1; // 0-indexed

      const expYear = Number.parseInt(year);
      const expMonth = Number.parseInt(month);

      // Check if card is expired
      if (expYear < currentYear) return false;
      if (expYear === currentYear && expMonth < currentMonth) return false;

      return true;
    }, "Kortet har gått ut"),
  cvv: z
    .string()
    .min(3, "CVV krävs")
    .max(4, "CVV måste vara 3-4 siffror")
    .regex(/^\d{3,4}$/, "CVV måste vara numeriskt"),
});

export type PaymentFormInputs = z.infer<typeof paymentFormSchema>;

export type CartStoreStateType = {
  cart: CartItemsType;
  hasHydrated: boolean;
};

export type CartStoreActionsType = {
  addToCart: (product: CartItemType) => void;
  removeFromCart: (product: CartItemType) => void;
  updateQuantity: (product: CartItemType, newQuantity: number) => void;
  clearCart: () => void;
};
