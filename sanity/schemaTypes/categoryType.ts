import { TagIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const categoryType = defineType({
  name: "category",
  title: "Category",
  type: "document",
  icon: TagIcon,
  fields: [
    defineField({
      name: "title",
      type: "string",
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: {
        source: "title",
      },
    }),
    defineField({
      name: "description",
      type: "text",
    }),
    defineField({
      name: "image",
      title: "Category Image",
      type: "image",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "parent",
      title: "Parent Category",
      type: "reference",
      to: [{ type: "category" }],
      options: {
        disableNew: true,
      },
    }),
    defineField({
      name: "subcategories",
      title: "Subcategories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "category" }] }],
      validation: (Rule) => Rule.unique(),
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "description",
      media: "image",
      parent: "parent.title",
    },
    prepare({ title, subtitle, media, parent }) {
      return {
        title,
        subtitle: parent ? `${parent} > ${subtitle || ""}` : subtitle,
        media,
      };
    },
  },
});
