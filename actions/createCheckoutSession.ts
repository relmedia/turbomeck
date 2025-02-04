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

export async function createCheckoutSession(
  items: CartItem[],
  metadata: Metadata,
  selectedShippingOptionId?: string
) {
  try {
    const customers = await stripe.customers.list({
      email: metadata?.customerEmail,
      limit: 1,
    });
    const customerId = customers.data.length > 0 ? customers.data[0].id : "";

    const sessionPayload: Stripe.Checkout.SessionCreateParams = {
      metadata: {
        orderNumber: metadata?.orderNumber,
        customerName: metadata?.customerName,
        customerEmail: metadata?.customerEmail,
        clerkUserId: metadata?.clerkUserId,
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
        allowed_countries: [
          "AD",
          "AL",
          "AT",
          "BA",
          "BE",
          "BG",
          "BY",
          "CH",
          "CY",
          "CZ",
          "DE",
          "DK",
          "EE",
          "ES",
          "FI",
          "FO",
          "FR",
          "GB",
          "GI",
          "GR",
          "HR",
          "HU",
          "IE",
          "IS",
          "IT",
          "LI",
          "LT",
          "LU",
          "LV",
          "MC",
          "MD",
          "ME",
          "MK",
          "MT",
          "NL",
          "NO",
          "PL",
          "PT",
          "RO",
          "RS",
          "RU",
          "SE",
          "SI",
          "SK",
          "SM",
          "UA",
          "VA",
          "XK",
        ],
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
