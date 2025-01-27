import { TrolleyIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const productType = defineType({
  name: "product",
  title: "Products",
  type: "document",
  icon: TrolleyIcon,
  fields: [
    defineField({
      name: "name",
      title: "Produkt Namn",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Permalänk",
      type: "slug",
      options: {
        source: "name",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "images",
      title: "Produkt Bilder",
      type: "array",
      of: [{ type: "image", options: { hotspot: true } }],
    }),
    defineField({
      name: "intro",
      title: "Produkt kort beskrivning",
      type: "string",
    }),
    defineField({
      name: "description",
      title: "Beskrivning",
      type: "blockContent",
    }),
    defineField({
      name: "price",
      title: "Pris",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "discount",
      title: "Rabatt",
      type: "number",
    }),
    defineField({
      name: "categories",
      title: "Kategorier",
      type: "array",
      of: [{ type: "reference", to: { type: "category" } }],
    }),
    defineField({
      name: "stock",
      title: "Antal i Lager",
      type: "number",
      validation: (Rule) => Rule.min(0),
    }),

    defineField({
      name: "status",
      title: "Produkt Status",
      type: "string",
      options: {
        list: [
          { title: "Ny", value: "new" },
          { title: "Het", value: "hot" },
          { title: "Försäljning", value: "sale" },
        ],
      },
    }),
    defineField({
      name: "variant",
      title: "Produkt Typ",
      type: "string",
      options: {
        list: [
          { title: "Bränslepumpar", value: "Branslepumpar" },
          { title: "Bränsletryck", value: "Bransletryck" },
          { title: "Downpipes", value: "Downpipes" },
          { title: "Dumpventiler", value: "Dumpventiler" },
          { title: "Flänsar & V-band", value: "Flansar & V-band" },
          { title: "Intercooler", value: "Intercooler" },
          { title: "Renoveringssatser", value: "Renoveringssatser" },
          { title: "Wastegate", value: "Wastegate" },
        ],
      },
    }),
  ],
  preview: {
    select: {
      title: "name",
      media: "images",
      subtitle: "price",
    },
    prepare(selection) {
      const { title, subtitle, media } = selection;
      const image = media && media[0];
      return {
        title: title,
        subtitle: `${subtitle}Kr`,
        media: image,
      };
    },
  },
});
