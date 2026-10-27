/**
 * Builds editable builder designs from the compiled templates.
 *
 * This is the migration. The compiled templates are tagged template literals:
 * correct, but only a developer can change a word in one. This file turns each
 * of them into an Unlayer design made of ordinary blocks — a heading, a
 * paragraph, a button — so the same email can be rearranged in the editor.
 *
 * ## Why rebuilt rather than imported
 *
 * Unlayer can only re-open its own design JSON; it has no HTML importer. The
 * alternative was to wrap each template's compiled HTML in a single `html`
 * block, which would open and preview but could not be edited block by block
 * — the whole point. So each design is reconstructed from the SAME copy data
 * the compiled template reads (`SHIPPING_NOTICE_COPY`, `translations`), which
 * is what keeps the two in step rather than forking the wording.
 *
 * Everything that varies per order is a merge token, not baked text, so one
 * design serves every order. The repeating parts — order lines, the totals
 * table, the three next-steps — are block tokens, because the editor has no
 * loop to express "once per product".
 *
 * ## The design shape
 *
 * Deliberately sparse. Unlayer fills in every value it is not given, and a
 * sparse design verified to load is a smaller thing to maintain than a full
 * one transcribed field by field. Verified against the live editor: a design
 * of this shape loads, renders, and exports its content back.
 */

import {
  SHIPPING_NOTICE_COPY,
  SHIPPING_NOTICE_LABELS,
  type ShippingNoticeKind,
} from "./email-shipping-notices.js";
import { SHOP_CONTACT_EMAIL } from "./email.js";

export type SeedLocale = "sv" | "en";

/** Every template the builder can take over, with a stable name per locale. */
export type SeedTemplate = {
  templateKey: string;
  locale: SeedLocale;
  name: string;
  subject: string;
  design: Record<string, unknown>;
};

const INK = "#111827";
const MUTED = "#6b7280";
const PAGE_BG = "#f3f4f6";
const CARD_BG = "#ffffff";

/* ------------------------------------------------------------------ *
 * Unlayer design primitives
 * ------------------------------------------------------------------ */

let seq = 0;
/** Ids only have to be unique within a design; readable beats random here. */
const nextId = (prefix: string) => `${prefix}_${++seq}`;

type Block = Record<string, unknown>;

function textBlock(html: string, opts: { align?: string; padding?: string; size?: string } = {}): Block {
  return {
    id: nextId("c"),
    type: "text",
    values: {
      containerPadding: opts.padding ?? "10px 24px",
      _meta: { htmlID: nextId("u_content_text"), htmlClassNames: "u_content_text" },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      textAlign: opts.align ?? "left",
      lineHeight: "150%",
      fontSize: opts.size ?? "15px",
      text: html,
    },
  };
}

function buttonBlock(label: string, href: string, accent: string): Block {
  return {
    id: nextId("c"),
    type: "button",
    values: {
      containerPadding: "16px 24px",
      _meta: { htmlID: nextId("u_content_button"), htmlClassNames: "u_content_button" },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      href: { name: "web", values: { href, target: "_blank" } },
      buttonColors: {
        color: "#ffffff",
        backgroundColor: accent,
        hoverColor: "#ffffff",
        hoverBackgroundColor: accent,
      },
      size: { autoWidth: true, width: "100%" },
      textAlign: "center",
      lineHeight: "120%",
      padding: "13px 26px",
      border: {},
      borderRadius: "8px",
      fontSize: "15px",
      text: `<span style="line-height: 18px;"><strong>${label}</strong></span>`,
    },
  };
}

function dividerBlock(): Block {
  return {
    id: nextId("c"),
    type: "divider",
    values: {
      containerPadding: "4px 24px",
      _meta: { htmlID: nextId("u_content_divider"), htmlClassNames: "u_content_divider" },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      width: "100%",
      border: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#e5e7eb" },
      textAlign: "center",
    },
  };
}

/** One block per row, which is what makes every piece independently movable. */
function row(block: Block, backgroundColor = CARD_BG): Record<string, unknown> {
  return {
    id: nextId("r"),
    cells: [1],
    columns: [
      {
        id: nextId("col"),
        contents: [block],
        values: { backgroundColor: "", padding: "0px", border: {} },
      },
    ],
    values: {
      columns: false,
      backgroundColor,
      columnsBackgroundColor: "",
      padding: "0px",
      hideDesktop: false,
      _meta: { htmlID: nextId("u_row"), htmlClassNames: "u_row" },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
    },
  };
}

function design(blocks: Block[]): Record<string, unknown> {
  return {
    counters: { u_row: blocks.length, u_column: blocks.length },
    body: {
      id: nextId("body"),
      rows: blocks.map((b) => row(b)),
      headers: [],
      footers: [],
      values: {
        popupPosition: "center",
        backgroundColor: PAGE_BG,
        contentWidth: "600px",
        contentAlign: "center",
        fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" },
        textColor: INK,
        linkStyle: {
          body: true,
          linkColor: "#0f766e",
          linkHoverColor: "#0f766e",
          linkUnderline: true,
          linkHoverUnderline: true,
        },
        _meta: { htmlID: "u_body", htmlClassNames: "u_body" },
      },
    },
    /** What this Unlayer build exports; an older number is silently upgraded. */
    schemaVersion: 27,
  };
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

const brandRow = () =>
  textBlock(
    `<p style="line-height: 150%;"><strong style="font-size: 20px; letter-spacing: 1px;">TURBOMECK</strong></p>`,
    { align: "center", padding: "24px 24px 8px" },
  );

const footerRow = (locale: SeedLocale) => {
  const l = SHIPPING_NOTICE_LABELS[locale];
  return textBlock(
    `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px;">${l.questions} <a href="mailto:${SHOP_CONTACT_EMAIL}">${SHOP_CONTACT_EMAIL}</a></p>` +
      `<p style="line-height: 150%; color: ${MUTED}; font-size: 12px;">Turbomeck.se — ${l.rights}</p>`,
    { align: "center", padding: "8px 24px 28px" },
  );
};

/** The badge + heading pair the shipping notices open with. */
const headingRow = (badge: string, heading: string) =>
  textBlock(
    `<p style="line-height: 150%;" align="center"><span style="font-size: 34px;">${badge}</span></p>` +
      `<p style="line-height: 140%;" align="center"><strong style="font-size: 23px;">${heading}</strong></p>`,
    { align: "center", padding: "16px 24px 4px" },
  );

/* ------------------------------------------------------------------ *
 * The five shipping notices
 * ------------------------------------------------------------------ */

/**
 * Which notices are about a parcel sitting at a service point. Those are the
 * ones where naming the pickup point and its address is the useful content;
 * "delivered" and the core return are not about a counter to walk up to.
 */
const PICKUP_KINDS = new Set<ShippingNoticeKind>([
  "ready_for_pickup",
  "pickup_reminder_1",
  "pickup_reminder_2",
]);

function shippingNoticeDesign(kind: ShippingNoticeKind, locale: SeedLocale): Record<string, unknown> {
  const c = SHIPPING_NOTICE_COPY[kind][locale];
  const l = SHIPPING_NOTICE_LABELS[locale];
  const blocks: Block[] = [brandRow(), headingRow(c.badge, c.heading)];

  blocks.push(
    textBlock(
      `<p style="line-height: 150%;">${l.greeting} {{customer_first_name}},</p>` +
        `<p style="line-height: 150%;">${c.lead}</p>`,
    ),
  );

  if (PICKUP_KINDS.has(kind)) {
    /**
     * The address lines are tokens rather than a baked block, so one design
     * covers every service point. Each sits on its own line because an empty
     * token (an order with no service point) must not leave a stray comma.
     */
    blocks.push(
      textBlock(
        `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">${l.pickupPoint}</p>` +
          `<p style="line-height: 150%;"><strong>{{service_point}}</strong></p>` +
          `<p style="line-height: 150%; color: ${MUTED};">{{service_point_address}}</p>`,
        { padding: "4px 24px" },
      ),
    );
  }

  if (kind === "core_return_reminder") {
    blocks.push(
      textBlock(
        `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">${l.deadline}</p>` +
          `<p style="line-height: 150%;"><strong>{{core_return_deadline}}</strong></p>` +
          `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px;">${l.coreBody("{{core_return_deadline}}")}</p>`,
        { padding: "4px 24px" },
      ),
    );
  }

  blocks.push(
    textBlock(
      `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px;">${l.orderNumber}: <strong style="color: ${INK};">{{order_number}}</strong></p>`,
      { padding: "4px 24px" },
    ),
  );

  /**
   * The core-return reminder has no parcel of ours to track, so it gets no
   * tracking button — a CTA pointing at an empty URL is worse than none.
   */
  if (kind !== "core_return_reminder") {
    blocks.push(buttonBlock(c.cta, "{{tracking_url}}", c.accent));
  }

  if (c.note) {
    blocks.push(
      textBlock(`<p style="line-height: 150%; color: ${MUTED}; font-size: 13px;">${c.note}</p>`, {
        padding: "4px 24px 16px",
      }),
    );
  }

  blocks.push(dividerBlock(), footerRow(locale));
  return design(blocks);
}

/* ------------------------------------------------------------------ *
 * The order confirmation
 * ------------------------------------------------------------------ */

const CONFIRMATION_COPY: Record<SeedLocale, Record<string, string>> = {
  sv: {
    heading: "Tack för ditt köp!",
    lead: "Vi har tagit emot din order och börjar behandla den direkt. Här är en sammanställning.",
    orderLabel: "Ordernummer",
    dateLabel: "Datum",
    products: "Beställda produkter",
    paymentLabel: "Betalningsmetod",
    deliveryLabel: "Levereras till",
    nextSteps: "Vad händer nu?",
  },
  en: {
    heading: "Thank you for your order!",
    lead: "We've received your order and will start processing it right away. Here's a summary.",
    orderLabel: "Order number",
    dateLabel: "Date",
    products: "Ordered products",
    paymentLabel: "Payment method",
    deliveryLabel: "Delivered to",
    nextSteps: "What happens next?",
  },
};

const sectionLabel = (text: string) =>
  textBlock(
    `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;"><strong>${text}</strong></p>`,
    { padding: "16px 24px 0px" },
  );

function orderConfirmationDesign(locale: SeedLocale): Record<string, unknown> {
  const c = CONFIRMATION_COPY[locale]!;

  return design([
    brandRow(),
    headingRow("🎉", c.heading!),
    textBlock(
      `<p style="line-height: 150%;">${locale === "sv" ? "Hej" : "Hi"} {{customer_first_name}},</p>` +
        `<p style="line-height: 150%;">${c.lead}</p>`,
    ),
    textBlock(
      `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px;">${c.orderLabel}: <strong style="color: ${INK};">{{order_number}}</strong> &nbsp;·&nbsp; ${c.dateLabel}: <strong style="color: ${INK};">{{order_date}}</strong></p>`,
      { padding: "0px 24px 8px" },
    ),
    dividerBlock(),

    sectionLabel(c.products!),
    /** Each block token gets a text block to itself: it expands to a whole
     *  table, and a table inside a shared paragraph breaks Outlook. */
    textBlock("<p>{{order_items}}</p>", { padding: "0px 24px" }),
    textBlock("<p>{{order_totals}}</p>", { padding: "8px 24px 16px" }),
    dividerBlock(),

    textBlock(
      `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px;">${c.paymentLabel}: <strong style="color: ${INK};">{{payment_method}}</strong></p>` +
        `<p style="line-height: 150%; color: ${MUTED}; font-size: 13px;">${c.deliveryLabel}: <strong style="color: ${INK};">{{delivery_address}}</strong></p>`,
      { padding: "12px 24px" },
    ),
    dividerBlock(),

    sectionLabel(c.nextSteps!),
    textBlock("<p>{{next_steps}}</p>", { padding: "4px 24px 16px" }),
    dividerBlock(),
    footerRow(locale),
  ]);
}

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

const NOTICE_NAMES: Record<ShippingNoticeKind, Record<SeedLocale, string>> = {
  ready_for_pickup: { sv: "Klar att hämta", en: "Ready for pickup" },
  pickup_reminder_1: { sv: "Påminnelse 1", en: "Reminder 1" },
  pickup_reminder_2: { sv: "Påminnelse 2", en: "Reminder 2" },
  order_delivered: { sv: "Levererad", en: "Delivered" },
  core_return_reminder: { sv: "Kärnretur — påminnelse", en: "Core return reminder" },
};

const NOTICE_KINDS = Object.keys(NOTICE_NAMES) as ShippingNoticeKind[];
const LOCALES: SeedLocale[] = ["sv", "en"];

/**
 * Every template the migration creates.
 *
 * Subjects keep the shape the compiled templates send, order number included:
 * a customer with three open orders needs to tell the mails apart in a list.
 */
export function seedTemplates(): SeedTemplate[] {
  seq = 0;
  const out: SeedTemplate[] = [];

  for (const locale of LOCALES) {
    out.push({
      templateKey: "order_confirmation",
      locale,
      name:
        locale === "sv"
          ? "Orderbekräftelse (tack för ditt köp)"
          : "Order confirmation (thank you)",
      subject:
        locale === "sv"
          ? "Tack för ditt köp! Order {{order_number}} - Turbomeck"
          : "Thank you for your order! Order {{order_number}} - Turbomeck",
      design: orderConfirmationDesign(locale),
    });
  }

  for (const kind of NOTICE_KINDS) {
    for (const locale of LOCALES) {
      out.push({
        templateKey: kind,
        locale,
        name: NOTICE_NAMES[kind][locale],
        subject: `${SHIPPING_NOTICE_COPY[kind][locale].subject} (#{{order_number}}) - Turbomeck`,
        design: shippingNoticeDesign(kind, locale),
      });
    }
  }

  return out;
}
