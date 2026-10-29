/**
 * Mounts the real VisitorsByLocation card and asserts what it renders.
 *
 * Why this exists: a card can type-check, build, and still come up blank or
 * show the wrong number. The browser extension could not reach the dev server
 * in the session this was written in, so instead of trusting the build, the
 * component is mounted in a DOM with its effects running and its fetch stubbed
 * with the exact JSON the real route returned.
 *
 * What it is NOT: a check of pixel layout or of how it looks in dark mode.
 * It proves the card renders, reads the API's shape correctly, and shows
 * honest numbers -- particularly that the unlocated visits are surfaced rather
 * than quietly left out of a 100% that came from eight rows.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json \
 *     apps/admin/src/components/__verify-visitors-by-location.tsx
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

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

/** Exactly what GET /api/dashboard/locations?days=28 answered on real data. */
const API_RESPONSE = {
  days: 28,
  totalVisits: 97,
  knownVisits: 8,
  unknownVisits: 89,
  countries: [
    { code: "SE", name: "Sverige", flag: "🇸🇪", visits: 4, cities: 2, share: 50 },
    { code: "AU", name: "Australien", flag: "🇦🇺", visits: 1, cities: 1, share: 12.5 },
    { code: "DE", name: "Tyskland", flag: "🇩🇪", visits: 1, cities: 1, share: 12.5 },
    { code: "NO", name: "Norge", flag: "🇳🇴", visits: 1, cities: 1, share: 12.5 },
    { code: "US", name: "USA", flag: "🇺🇸", visits: 1, cities: 1, share: 12.5 },
  ],
  cities: [
    { city: "Gothenburg", countryCode: "SE", countryName: "Sverige", flag: "🇸🇪", visits: 3 },
    { city: "Oslo", countryCode: "NO", countryName: "Norge", flag: "🇳🇴", visits: 1 },
    { city: "Umea", countryCode: "SE", countryName: "Sverige", flag: "🇸🇪", visits: 1 },
  ],
};

const EMPTY_RESPONSE = {
  days: 7,
  totalVisits: 0,
  knownVisits: 0,
  unknownVisits: 0,
  countries: [],
  cities: [],
};

/** Nothing located yet -- the state the dashboard is in the day this ships. */
const ALL_UNKNOWN_RESPONSE = {
  days: 28,
  totalVisits: 97,
  knownVisits: 0,
  unknownVisits: 97,
  countries: [],
  cities: [],
};

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
  url: "http://localhost:3001/",
  pretendToBeVisual: true,
});

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
/**
 * `navigator` is getter-only on the Node global, so it is defined rather than
 * assigned. React's DOM renderer reads it during hydration.
 */
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: FrameRequestCallback) => dom.window.setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);
g.MutationObserver = dom.window.MutationObserver;
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.DOMRect = dom.window.DOMRect;
g.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});
dom.window.matchMedia = g.matchMedia as typeof dom.window.matchMedia;

let fetched: string[] = [];
let payload: unknown = API_RESPONSE;
let status = 200;
g.fetch = async (url: unknown) => {
  fetched.push(String(url));
  return {
    ok: status === 200,
    status,
    json: async () => payload,
  } as Response;
};

async function main() {
  /** Imported after the DOM exists: React reads globals at module scope. */
  const React = await import("react");
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  /**
   * The app's tsconfig uses jsx:"preserve" for Next, so tsx compiles JSX to
   * the classic `React.createElement` form, which expects React as a global.
   * Next supplies that itself; a harness has to.
   */
  g.React = React;
  const { VisitorsByLocation } = await import("./VisitorsByLocation");

  const container = dom.window.document.getElementById("root")!;
  // React 19 wants this flag set for act() to drive effects.
  (g as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(VisitorsByLocation));
  });
  /** Let the stubbed fetch resolve and the state update flush. */
  await act(async () => {
    await new Promise((r) => dom.window.setTimeout(r, 0));
  });

  const text = () => container.textContent ?? "";

  /* ---- it renders at all ---------------------------------------------- */
  check("the card is not blank", container.innerHTML.length > 500, container.innerHTML.length);
  check("it has its heading", text().includes("Besökare per plats"));
  check("it asked the right endpoint", fetched.some((u) => u.includes("/api/dashboard/locations?days=28")), fetched);

  /* ---- the countries, as the API returned them ------------------------ */
  for (const c of API_RESPONSE.countries) {
    check(`${c.code} is listed by its Swedish name`, text().includes(c.name));
  }
  check("the Swedish flag is rendered", text().includes("🇸🇪"));
  check("visit counts are shown", text().includes("4 besök"), text().match(/\d+ besök/g)?.slice(0, 3));
  check("the leading share is shown", text().includes("50%"));

  /**
   * The honesty check. 89 of 97 visits have no location; a card that showed
   * only "Sverige 50%" would be reporting a confident split of eight rows.
   */
  check("the unlocated visits are stated", text().includes("89") && text().includes("97"), {
    mentions89: text().includes("89"),
    mentions97: text().includes("97"),
  });
  check(
    "and explained, so it does not read as a bug",
    text().includes("saknar plats") && text().includes("efterhand"),
  );
  check(
    "the subtitle counts located visits against the total",
    text().includes("8 av 97"),
    text().slice(text().indexOf("Besökare per plats"), text().indexOf("Besökare per plats") + 90),
  );

  /* ---- the bars are sized from the data ------------------------------- */
  {
    const bars = [...container.querySelectorAll("div[style*='width']")] as HTMLElement[];
    const widths = bars.map((b) => b.style.width);
    check("a bar is drawn per country", widths.length >= API_RESPONSE.countries.length, widths);
    check("the widest bar is Sweden's 50%", widths.includes("50%"), widths.slice(0, 6));
    /** A zero-width bar would render as nothing at all. */
    check("no bar collapses to zero", !widths.includes("0%"), widths);
  }

  /* ---- only six countries until asked for more ------------------------ */
  {
    /** Five countries here, so the toggle should be absent. */
    const buttons = [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
    check(
      "no 'show all' button while everything already fits",
      !buttons.some((b) => b.includes("Visa alla")),
      buttons,
    );
  }

  /* ---- the cities tab ------------------------------------------------- */
  {
    const cityTab = [...container.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Städer",
    );
    check("there is a Städer tab", Boolean(cityTab));
    if (cityTab) {
      await act(async () => {
        cityTab.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      check("switching tabs shows the busiest city", text().includes("Gothenburg"));
      check("and the city's country alongside it", text().includes("Norge"));
      check("the city visit count is shown", text().includes("3"));
      /** Country rows must be gone, or both lists would stack. */
      check("the country list is replaced, not appended", !text().includes("4 besök"));
    }
  }

  /* ---- an empty window ------------------------------------------------ */
  {
    payload = EMPTY_RESPONSE;
    const refresh = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Uppdatera",
    );
    check("there is a refresh control", Boolean(refresh));
    if (refresh) {
      await act(async () => {
        refresh.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        await new Promise((r) => dom.window.setTimeout(r, 0));
      });
      check("no visits reads as a sentence, not an empty card", text().includes("Inga besök"), text().slice(0, 160));
    }
  }

  /* ---- nothing located yet: the state on the day this ships ----------- */
  {
    payload = ALL_UNKNOWN_RESPONSE;
    /**
     * Back to the country tab first. The card remembers the tab you were on,
     * which is the right behaviour -- but it means this assertion has to say
     * which list it is making a claim about.
     */
    const countryTab = [...container.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Länder",
    );
    if (countryTab) {
      await act(async () => {
        countryTab.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
    }
    const refresh = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Uppdatera",
    );
    if (refresh) {
      await act(async () => {
        refresh.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        await new Promise((r) => dom.window.setTimeout(r, 0));
      });
      check(
        "97 visits with no location says so rather than showing an empty list",
        text().includes("Ingen plats kunde fastställas") && text().includes("97"),
        text().slice(-220),
      );
    }
  }

  /* ---- a failing API ---------------------------------------------------- */
  {
    status = 500;
    payload = { error: "boom" };
    const refresh = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Uppdatera",
    );
    if (refresh) {
      await act(async () => {
        refresh.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      await act(async () => {
        await new Promise((r) => dom.window.setTimeout(r, 0));
      });
      check(
        "a failing request shows an error instead of a blank card",
        text().includes("Kunde inte"),
        text().slice(-160),
      );
    }
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
