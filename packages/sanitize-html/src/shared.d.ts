export declare const RICH_TEXT_SANITIZE: {
  ALLOWED_TAGS: readonly string[];
  ALLOWED_ATTR: readonly string[];
};

type Hookable = {
  addHook: (name: "afterSanitizeAttributes", cb: (node: unknown) => void) => unknown;
};

export declare function registerAnchorRelHook(DP: Hookable): void;
