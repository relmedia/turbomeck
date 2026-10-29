/**
 * Does VisitTracker honour the analytics consent the banner asks for?
 *
 * This is the claim worth testing, because getting it wrong is invisible: a
 * visit is recorded by a `fetch(...).catch(() => {})` that nobody watches, so
 * tracking a visitor who said no looks exactly like tracking one who said yes.
 * Before this gate existed the banner asked the question and nothing read the
 * answer.
 *
 * The three states that matter:
 *
 *  - no choice made yet  -> nothing sent (the visitor has not been asked yet)
 *  - analytics declined  -> nothing sent, ever
 *  - analytics accepted  -> exactly one visit, even if consent arrives late
 *
 * Mounts the real component against the real context, with fetch counted.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/client/tsconfig.json \
 *     apps/client/src/components/__verify-visit-tracker-consent.tsx
 */

/**
 * jsdom lives in the workspace store as a transitive dependency, so it is
 * loaded by store path rather than added to this app's package.json for a
 * harness. Typed structurally for the same reason: its own type declarations
 * are not resolvable from here, and `check-types` must stay clean.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require("../../../../node_modules/.pnpm/jsdom@28.1.0/node_modules/jsdom") as {
  JSDOM: new (
    html: string,
    options?: { url?: string; pretendToBeVisual?: boolean },
  ) => { window: Window & typeof globalThis };
};

import type { ConsentCategories, CookieConsentContextValue } from "./cookie-consent/types";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost:3002/produkter",
  pretendToBeVisual: true,
});

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.sessionStorage = dom.window.sessionStorage;
g.requestAnimationFrame = (cb: FrameRequestCallback) => dom.window.setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);

const posted: Array<{ url: string; body: unknown }> = [];
g.fetch = async (url: unknown, init?: { body?: string }) => {
  posted.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
  return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
};

/** usePathname, without a Next router in the tree. */
const PATH = "/produkter";

function consentValue(
  categories: ConsentCategories,
  hasConsented: boolean,
): CookieConsentContextValue {
  return {
    state: { categories, hasConsented } as CookieConsentContextValue["state"],
  } as CookieConsentContextValue;
}

const ALL_ON: ConsentCategories = {
  necessary: true,
  analytics: true,
  marketing: true,
  preferences: true,
};
const ANALYTICS_OFF: ConsentCategories = { ...ALL_ON, analytics: false };
/** What the state looks like before the banner has been answered. */
const UNDECIDED: ConsentCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
};

async function main() {
  const React = await import("react");
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  g.React = React;

  /**
   * usePathname reads Next's PathnameContext. Supplying the context is what
   * lets the REAL component mount -- stubbing the module is not possible, its
   * exports are getters.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PathnameContext } = require(
    "../../../../node_modules/.pnpm/next@16.2.6_react-dom@19.1.4_react@19.1.4__react@19.1.4/node_modules/next/dist/shared/lib/hooks-client-context.shared-runtime.js",
  ) as { PathnameContext: React.Context<string> };

  const { CookieConsentContext } = await import("./cookie-consent/cookie-provider");
  const { VisitTracker } = await import("./VisitTracker");

  (g as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const mount = async (categories: ConsentCategories, hasConsented: boolean) => {
    const host = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(
          PathnameContext.Provider,
          { value: PATH },
          React.createElement(
            CookieConsentContext.Provider,
            { value: consentValue(categories, hasConsented) },
            React.createElement(VisitTracker),
          ),
        ),
      );
    });
    await act(async () => {
      await new Promise((r) => dom.window.setTimeout(r, 0));
    });
    return { root, host };
  };

  /* ---- before the visitor has been asked ------------------------------- */
  {
    posted.length = 0;
    dom.window.sessionStorage.clear();
    const { root } = await mount(UNDECIDED, false);
    check(
      "nothing is sent before the banner has been answered",
      posted.length === 0,
      posted,
    );
    await act(async () => root.unmount());
  }

  /* ---- the visitor declined analytics ---------------------------------- */
  {
    posted.length = 0;
    dom.window.sessionStorage.clear();
    const { root } = await mount(ANALYTICS_OFF, true);
    check("nothing is sent when analytics is declined", posted.length === 0, posted);

    /**
     * And the session is not marked as sent either — otherwise a visitor who
     * declined and then accepted would never be counted, because the guard
     * would already have been set.
     */
    check(
      "declining does not consume the session's one visit",
      dom.window.sessionStorage.getItem("turbomeck-visit-sent") === null,
      dom.window.sessionStorage.getItem("turbomeck-visit-sent"),
    );
    await act(async () => root.unmount());
  }

  /* ---- the visitor accepted -------------------------------------------- */
  {
    posted.length = 0;
    dom.window.sessionStorage.clear();
    const { root } = await mount(ALL_ON, true);
    check("a visit is sent once analytics is accepted", posted.length === 1, posted);
    check(
      "it posts to the visit endpoint",
      posted[0]?.url === "/api/analytics/visit",
      posted[0]?.url,
    );
    const body = posted[0]?.body as { path?: string; deviceType?: string; browser?: string } | null;
    check("it carries the path", body?.path === PATH, body);
    check(
      "it carries device and browser, and nothing else",
      Boolean(body?.deviceType) && Boolean(body?.browser) && Object.keys(body ?? {}).length === 3,
      Object.keys(body ?? {}),
    );
    /** The location is added server-side; the browser must not be sending one. */
    check(
      "it does not send a location the browser could forge",
      !("country" in (body ?? {})) && !("city" in (body ?? {})),
      Object.keys(body ?? {}),
    );
    await act(async () => root.unmount());
  }

  /* ---- consent granted mid-session ------------------------------------- */
  {
    posted.length = 0;
    dom.window.sessionStorage.clear();
    const host = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(host);
    const root = createRoot(host);

    const render = async (categories: ConsentCategories, hasConsented: boolean) => {
      await act(async () => {
        root.render(
          React.createElement(
            PathnameContext.Provider,
            { value: PATH },
            React.createElement(
              CookieConsentContext.Provider,
              { value: consentValue(categories, hasConsented) },
              React.createElement(VisitTracker),
            ),
          ),
        );
      });
      await act(async () => {
        await new Promise((r) => dom.window.setTimeout(r, 0));
      });
    };

    await render(UNDECIDED, false);
    check("still nothing while the banner is open", posted.length === 0, posted);

    /** The visitor clicks accept. */
    await render(ALL_ON, true);
    check("accepting mid-session records the visit", posted.length === 1, posted);

    /** A re-render must not record it twice. */
    await render(ALL_ON, true);
    check("and only once, however often it re-renders", posted.length === 1, posted.length);
    await act(async () => root.unmount());
  }

  /* ---- one per session, not one per page ------------------------------- */
  {
    posted.length = 0;
    dom.window.sessionStorage.clear();
    const first = await mount(ALL_ON, true);
    check("the first page of a session is recorded", posted.length === 1);
    await act(async () => first.root.unmount());

    /** A second page view in the same session: sessionStorage still set. */
    const second = await mount(ALL_ON, true);
    check("a second page in the same session is not", posted.length === 1, posted.length);
    await act(async () => second.root.unmount());
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
