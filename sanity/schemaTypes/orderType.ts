import { BasketIcon, PackageIcon } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

export const shippingAddress = defineType({
  name: "shippingAddress",
  title: "Shipping Address",
  type: "object",
  icon: PackageIcon,
  fields: [
    defineField({
      name: "line1",
      title: "Adresslinje 1",
      type: "string",
    }),
    defineField({
      name: "line2",
      title: "Adresslinje 2",
      type: "string",
    }),
    defineField({
      name: "City",
      title: "Ort",
      type: "string",
    }),
    defineField({
      name: "postalCode",
      title: "Postnummer",
      type: "string",
    }),
    defineField({
      name: "country",
      title: "Land",
      type: "string",
    }),
  ],
});

export const orderType = defineType({
  name: "order",
  title: "Order",
  type: "document",
  icon: BasketIcon,
  fields: [
    defineField({
      name: "orderNumber",
      title: "Order Nummer",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    {
      name: "invoice",
      title: "Faktura",
      type: "object",
      fields: [
        { name: "id", type: "string" },
        { name: "number", title: "Nummer", type: "string" },
        { name: "hosted_invoice_url", type: "url" },
      ],
    },
    defineField({
      name: "stripeCheckoutSessionId",
      title: "Stripe Checkout Session ID",
      type: "string",
    }),
    defineField({
      name: "stripeCustomerId",
      title: "Stripe Customer ID",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "clerkUserId",
      title: "Store User ID",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "customerName",
      title: "Kundens namn",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "email",
      title: "E-post till kund",
      type: "string",
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: "stripePaymentIntentId",
      title: "Stripe Payment Intent ID",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "shippingAddress",
      title: "Leveransadress",
      type: "shippingAddress",
    }),
    defineField({
      name: "products",
      title: "Produkter",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "product",
              title: "Produkt som köpts",
              type: "reference",
              to: [{ type: "product" }],
            }),
            defineField({
              name: "quantity",
              title: "Köpt kvantitet",
              type: "number",
            }),
          ],
          preview: {
            select: {
              product: "product.name",
              quantity: "quantity",
              image: "product.image",
              price: "product.price",
              currency: "product.currency",
            },
            prepare(select) {
              return {
                title: `${select.product} x ${select.quantity}`,
                subtitle: `${select.price * select.quantity}`,
                media: select.image,
              };
            },
          },
        }),
      ],
    }),
    defineField({
      name: "totalPrice",
      title: "Totalt pris",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "currency",
      title: "Valuta",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "amountDiscount",
      title: "Rabatt",
      type: "number",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "status",
      title: "Order Status",
      type: "string",
      options: {
        list: [
          {
            title: "Avvaktande",
            value: "AVVAKTANDE",
          },
          {
            title: "Betald",
            value: "BETALD",
          },
          {
            title: "Skickad",
            value: "SKICKAD",
          },
          {
            title: "Levererad",
            value: "LEVERERAD",
          },
          {
            title: "Avbruten",
            value: "AVBRUTEN",
          },
        ],
      },
    }),
    defineField({
      name: "orderDate",
      title: "Order Datum",
      type: "datetime",
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      name: "customerName",
      amount: "totalPrice",
      currency: "currency",
      orderId: "orderNumber",
      email: "email",
    },
    prepare(select) {
      const orderIdSnippet = `${select.orderId.slice(0, 5)}...${select.orderId.slice(-5)}`;
      return {
        title: `${select.name} (${orderIdSnippet})`,
        subtitle: `${select.amount} ${select.currency}, ${select.email}`,
        media: BasketIcon,
      };
    },
  },
});
