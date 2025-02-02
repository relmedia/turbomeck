"use server";

import stripe from "@/lib/stripe";
import { urlFor } from "@/sanity/lib/image";
import { CartItem } from "@/store";
import Stripe from "stripe";

export interface Metadata {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  clerkUserId: string;
}

export interface GroupedCartItems {
  product: CartItem["product"];
  quantity: number;
}

// Define PostNord shipping options
const postnordShippingOptions = [
  {
    id: "postnord_standard",
    name: "PostNord Standard",
    price: 4900, // 49 SEK in öre
    delivery_estimate: {
      minimum: { unit: "business_day", value: 3 },
      maximum: { unit: "business_day", value: 5 },
    },
  },
  {
    id: "postnord_express",
    name: "PostNord Express",
    price: 9900, // 99 SEK in öre
    delivery_estimate: {
      minimum: { unit: "business_day", value: 1 },
      maximum: { unit: "business_day", value: 2 },
    },
  },
  {
    id: "postnord_free",
    name: "Gratis Frakt",
    price: 0,
    delivery_estimate: {
      minimum: { unit: "business_day", value: 5 },
      maximum: { unit: "business_day", value: 7 },
    },
  },
];

export async function createCheckoutSession(
  items: CartItem[],
  metadata: Metadata,
  selectedShippingOptionId: string
) {
  try {
    const customers = await stripe.customers.list({
      email: metadata?.customerEmail,
      limit: 1,
    });
    const customerId = customers.data.length > 0 ? customers.data[0].id : "";

    // Find the selected shipping option
    const selectedShipping = postnordShippingOptions.find(
      (option) => option.id === selectedShippingOptionId
    );

    if (!selectedShipping) {
      throw new Error("Invalid shipping option selected");
    }

    const sessionPayload: Stripe.Checkout.SessionCreateParams = {
      metadata: {
        orderNumber: metadata?.orderNumber,
        customerName: metadata?.customerName,
        customerEmail: metadata?.customerEmail,
        clerkUserId: metadata?.clerkUserId,
        shippingOptionId: selectedShippingOptionId,
      },
      mode: "payment",
      allow_promotion_codes: true,
      payment_method_types: ["card", "klarna"],
      invoice_creation: {
        enabled: true,
      },
      payment_method_options: {
        klarna: {
          setup_future_usage: "none",
        },
      },
      shipping_address_collection: {
        allowed_countries: ["SE", "NO", "DK", "FI", "IS"],
      },
      success_url: `${
        process.env.NEXT_PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL}`
      }/success?session_id={CHECKOUT_SESSION_ID}&orderNumber=${metadata.orderNumber}`,
      cancel_url: `${
        process.env.NEXT_PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL}`
      }/cart`,
      line_items: [
        ...items.map((item) => ({
          price_data: {
            currency: "SEK",
            unit_amount: Math.round(item.product.price! * 100),
            product_data: {
              name: item.product.name || "Unnamed Product",
              description: `Product ID: ${item.product._id}`,
              metadata: { id: item.product._id },
              images:
                item.product.images && item.product.images.length > 0
                  ? [urlFor(item.product.images[0]).url()]
                  : undefined,
            },
          },
          quantity: item.quantity,
        })),
        // Add shipping as a line item
        {
          price_data: {
            currency: "SEK",
            unit_amount: selectedShipping.price,
            product_data: {
              name: selectedShipping.name,
              description: `Delivery in ${selectedShipping.delivery_estimate.minimum.value}-${selectedShipping.delivery_estimate.maximum.value} ${selectedShipping.delivery_estimate.minimum.unit}s`,
            },
          },
          quantity: 1,
        },
      ],
    };

    if (customerId) {
      sessionPayload.customer = customerId;
    } else {
      sessionPayload.customer_email = metadata.customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionPayload);
    return session.url;
  } catch (error) {
    console.error("Error creating checkout session:", error);
    throw error;
  }
}
