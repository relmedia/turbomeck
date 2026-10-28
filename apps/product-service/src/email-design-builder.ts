/**
 * The primitives every generated design is built from.
 *
 * Extracted from the seed so there is ONE construction path for Unlayer
 * design JSON. That matters more than it looks: a design with a subtly wrong
 * shape does not error, it opens blank in the editor — a failure invisible to
 * any test that only inspects the JSON. This shape was verified against the
 * live editor, and anything that builds designs goes through it rather than
 * assembling its own.
 *
 * Deliberately sparse. Unlayer fills in every value it is not given, so a
 * verified-sparse design is less to maintain than a full one transcribed
 * field by field.
 */

export type Block = Record<string, unknown>;

export const INK = "#111827";
export const MUTED = "#6b7280";
export const PAGE_BG = "#f3f4f6";
export const CARD_BG = "#ffffff";

/* ------------------------------------------------------------------ *
 * Unlayer design primitives
 * ------------------------------------------------------------------ */

let seq = 0;

/** Restarts ids so a fresh batch of designs is reproducible. */
export function resetIdSequence(): void {
  seq = 0;
}
/** Ids only have to be unique within a design; readable beats random here. */
const nextId = (prefix: string) => `${prefix}_${++seq}`;

export function textBlock(html: string, opts: { align?: string; padding?: string; size?: string } = {}): Block {
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

export function buttonBlock(label: string, href: string, accent: string): Block {
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

export function dividerBlock(): Block {
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
export function row(block: Block, backgroundColor = CARD_BG): Record<string, unknown> {
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

export function design(blocks: Block[]): Record<string, unknown> {
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
