import { type SchemaTypeDefinition } from "sanity";
import banner from "./banner";
import { blockContentType } from "./blockContentType";
import { categoryType } from "./categoryType";
import { productType } from "./productType";
import { orderType, shippingAddress } from "./orderType";
import { salesType } from "./saleType";

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    blockContentType,
    categoryType,
    productType,
    orderType,
    shippingAddress,
    salesType,
    banner,
  ],
};
