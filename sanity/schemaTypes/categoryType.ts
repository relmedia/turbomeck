import { TagIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const categoryType = defineType({
  name: "category",
  title: "Kategori",
  type: "document",
  icon: TagIcon,
  fields: [
    defineField({
      name: "title",
      type: "string",
    }),
    defineField({
      name: "slug",
      title: "Permalänk",
      type: "slug",
      options: {
        source: "title",
      },
    }),
    defineField({
      name: "description",
      title: "beskrivning",
      type: "text",
    }),
    defineField({
      name: "image",
      title: "Kategori Bild",
      type: "image",
      options: {
        hotspot: true,
      },
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "description",
      media: "image",
    },
  },
});
