/**
 * Checks the live scorer against the shop's real product copy.
 *
 * Real names, not invented ones. The whole feature is advice about this
 * catalogue, and a scorer tuned on fixtures would mostly prove it matches my
 * idea of what a turbo listing looks like. `TD04HL-19T Upgrade` must come out
 * as weak and `Wastegate Saab AERO 93 ,95` must not, because that is the
 * difference the admin will see.
 *
 * The second half is the one that matters most: the meta-description preview
 * has to be byte-identical to what the product page actually emits. A preview
 * that disagrees with what ships is worse than no preview, because it is
 * trusted.
 *
 * Pure — no database, no network.
 *
 * Run:
 *   node node_modules/.pnpm/tsx@4.20.6/node_modules/tsx/dist/cli.mjs \
 *     --tsconfig apps/admin/tsconfig.json \
 *     apps/admin/src/lib/__verify-seo-score.ts
 */

import { htmlToText, truncateAtWord } from "@repo/text";
import {
  scoreSeo,
  extractCodes,
  missingCodes,
  preservesCodes,
  metaDescriptionFor,
  META_LIMIT,
  TITLE_SUFFIX,
} from "./seo-score";

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "  OK  " : " FAIL "} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};

const has = (r: ReturnType<typeof scoreSeo>, id: string) => r.findings.some((f) => f.id === id);

/** Verbatim from the live catalogue. */
const REAL = [
  { name: "TD04L-19T Saab 9-3 2003-2010", short: "Uppgradera din Saab 9-3 med denna högpresterande raceaxel designad för krävande körning och höga laddtryck i vardag och på bana." },
  { name: "22T TD04HL SAAB 93/5", short: "Denna TD04HL-baserade turbo är en utmärkt uppgradering för dig som söker mer effekt utan att tappa vardagskörbarheten i din Saab." },
  { name: "Adapter fläns från rak till kona", short: "En praktisk lösning när du behöver anpassa avgassystemet mellan komponenter med olika anslutningar och former." },
  { name: "Wastegate Saab AERO 93 ,95", short: "Wastegaten reglerar laddtrycket genom att avleda överskottsgaser från turbinen, vilket skyddar motorn och håller trycket stabilt." },
  { name: "TD04HL-19T Volvo 2003-2008  2,5T", short: "TD04HL-19T är en beprövad uppgradering för dig som vill ha mer kraft och bättre respons i din Volvo utan att byta hela systemet." },
  { name: "Volvo K24-k26 anpassad för 940-740", short: "Uppgraderad Volvo K24-K26 turbo, specialanpassad för Volvo 940 och 740 med fokus på hållbarhet och jämn effektkurva." },
  { name: "TD04HL-19T Upgrade", short: "Turbinhuset är portat för optimerat avgasflöde, vilket ger snabbare turborespons och högre effekt i hela registret." },
  { name: "Renoverings sats TD04HL", short: "Renoveringssats för TD04HL-turboaggregat, en komplett Major-reparationssats med allt som behövs för en ordentlig renovering." },
];

/* ---- the preview must equal what the page emits ------------------------ */
{
  /**
   * This reproduces the exact expression in
   * `apps/client/src/app/products/[slug]/page.tsx` generateMetadata. If that
   * line changes, this comparison is what notices.
   */
  const asThePageDoesIt = (short: string, name: string) =>
    truncateAtWord(htmlToText(short) || htmlToText("") || name, META_LIMIT);

  let mismatches = 0;
  for (const p of REAL) {
    const ours = metaDescriptionFor(p.short, p.name);
    const theirs = asThePageDoesIt(p.short, p.name);
    if (ours !== theirs) {
      mismatches++;
      console.log(`       ${p.name}\n         preview: ${ours}\n         page   : ${theirs}`);
    }
  }
  check("the meta preview is byte-identical to the page's", mismatches === 0, { mismatches });

  /** Rich text in, plain text out — a meta description must carry no markup. */
  const withMarkup = metaDescriptionFor(
    "<p>Uppgraderad <strong>Volvo</strong> K24&nbsp;turbo</p><p>för 940</p>",
    "x",
  );
  check("markup is stripped from the preview", !/[<>]/.test(withMarkup), withMarkup);
  check("entities are decoded, not left raw", !withMarkup.includes("&nbsp;"), withMarkup);
  check("block boundaries become spaces, not glued words", withMarkup.includes("turbo för"), withMarkup);

  /** Over the limit must be cut at a word with an ellipsis, not mid-word. */
  const long = metaDescriptionFor("A".repeat(50) + " " + "verylongword ".repeat(20), "x");
  check("an over-long description is truncated", long.length <= META_LIMIT + 1, long.length);
  check("and ends with an ellipsis", long.endsWith("…"), long.slice(-12));
}

/* ---- the judgement calls, on real names -------------------------------- */
{
  const weak = scoreSeo({ name: "TD04HL-19T Upgrade", shortDescription: REAL[6]!.short });
  check("a bare part number is flagged as missing a product word", has(weak, "no-product-term"));
  check("...and as missing a vehicle", has(weak, "no-vehicle-term"));
  check("...and as too short a title", has(weak, "title-short"));

  const strong = scoreSeo({ name: "Wastegate Saab AERO 93 ,95", shortDescription: REAL[3]!.short });
  check("a name with a part type is not flagged for it", !has(strong, "no-product-term"));
  check("...and a name with a make is not flagged for it", !has(strong, "no-vehicle-term"));

  /** The one case where a short name is genuinely fine should score better. */
  check("the stronger name scores above the weaker one", strong.score > weak.score, {
    strong: strong.score,
    weak: weak.score,
  });

  const noVehicle = scoreSeo({ name: "Adapter fläns från rak till kona", shortDescription: REAL[2]!.short });
  check("a part word is recognised with Swedish characters", !has(noVehicle, "no-product-term"));
  check("...but a missing vehicle is still reported", has(noVehicle, "no-vehicle-term"));
}

/* ---- lengths ----------------------------------------------------------- */
{
  const r = scoreSeo({ name: "Turbo TD04HL-19T till Saab 9-3 2.0T", shortDescription: REAL[0]!.short });
  check("the title preview carries the site suffix", r.titlePreview.endsWith(TITLE_SUFFIX), r.titlePreview);
  check("the title length includes the suffix", r.titleLength === r.titlePreview.length, r.titleLength);

  const tooLong = scoreSeo({
    name: "Turbo TD04HL-19T komplett uppgraderingssats till Saab 9-3 Aero och Volvo 940 Turbo",
    shortDescription: REAL[0]!.short,
  });
  check("an over-long title is flagged", has(tooLong, "title-long"), tooLong.titleLength);

  const thin = scoreSeo({ name: "Turbo Saab 9-3", shortDescription: "Kort." });
  check("a thin description is flagged as under-using the space", has(thin, "meta-short"), thin.metaLength);

  const empty = scoreSeo({ name: "Turbo Saab 9-3", shortDescription: "" });
  check("a missing description is flagged", has(empty, "meta-missing"));
  check("and that is severe, not a nudge", empty.findings.find((f) => f.id === "meta-missing")?.severity === "bad");
}

/* ---- duplicates -------------------------------------------------------- */
{
  const others = REAL.map((p) => ({ name: p.name, shortDescription: p.short }));

  const dupName = scoreSeo({ name: "TD04HL-19T Upgrade", shortDescription: "unik text här", others });
  check("a duplicate name is caught", has(dupName, "dup-name"));

  const dupMeta = scoreSeo({ name: "Ett helt nytt namn", shortDescription: REAL[0]!.short, others });
  check("a duplicate description is caught", has(dupMeta, "dup-meta"));

  /** The real catalogue has none, so scoring each against the rest must be clean. */
  let falsePositives = 0;
  for (const p of REAL) {
    const rest = others.filter((o) => o.name !== p.name);
    const r = scoreSeo({ name: p.name, shortDescription: p.short, others: rest });
    if (has(r, "dup-name") || has(r, "dup-meta")) falsePositives++;
  }
  check("no false duplicates across the real catalogue", falsePositives === 0, { falsePositives });
}

/* ---- English ----------------------------------------------------------- */
{
  const noEn = scoreSeo({ name: "Turbo Saab 9-3", shortDescription: REAL[0]!.short });
  check("missing English is reported", has(noEn, "no-english"));
  const withEn = scoreSeo({
    name: "Turbo Saab 9-3",
    shortDescription: REAL[0]!.short,
    nameEn: "Turbo for Saab 9-3",
    shortDescriptionEn: "An upgrade for your Saab.",
  });
  check("...and not reported once both are filled", !has(withEn, "no-english"));
}

/* ---- part codes: the guarantee the suggestion filter rests on ---------- */
{
  const cases: Array<[string, string[]]> = [
    ["TD04HL-19T Volvo 2003-2008  2,5T", ["TD04HL-19T"]],
    ["Volvo K24-k26 anpassad för 940-740", ["K24-K26", "940-740"]],
    ["TD04L-19T Saab 9-3 2003-2010", ["TD04L-19T"]],
    ["Wastegate Saab AERO 93 ,95", []],
  ];
  for (const [name, expected] of cases) {
    const codes = extractCodes(name);
    const missing = expected.filter((e) => !codes.includes(e));
    check(`codes found in "${name}"`, missing.length === 0, { codes, missing });
  }

  /** A plain word must never be mistaken for a model code. */
  check("a word with no digits is not a code", extractCodes("Wastegate Saab").length === 0);
  /** Nor a small count like "2 st". */
  check("a one- or two-digit number is not a code", !extractCodes("Paket med 2 delar").includes("2"));
  /** Case must not matter, since admins type k26 and K26 interchangeably. */
  check("codes are normalised to upper case", extractCodes("volvo k24").includes("K24"), extractCodes("volvo k24"));
}

/* ---- the rejection rule itself ----------------------------------------- */
{
  /** The dangerous case: one digit changed sells a different turbo. */
  check(
    "a changed model code is rejected",
    !preservesCodes("TD04HL-19T Upgrade", "Turbo TD04HL-20T till Saab 9-3"),
    missingCodes("TD04HL-19T Upgrade", "Turbo TD04HL-20T till Saab 9-3"),
  );
  check(
    "a dropped model code is rejected",
    !preservesCodes("TD04HL-19T Upgrade", "Uppgraderad turbo till Saab 9-3"),
  );

  /** Legitimate rewrites that must NOT be rejected. */
  const ok: Array<[string, string, string]> = [
    ["reformatted with punctuation", "TD04HL-19T Upgrade", "Turbo TD04HL-19T till Saab 9-3 Aero"],
    ["en-dash year range", "TD04L-19T Saab 9-3 2003-2010", "Turbo TD04L-19T till Saab 9-3 2003–2010"],
    ["decimal point for comma", "TD04HL-19T Volvo 2003-2008  2,5T", "Turbo TD04HL-19T till Volvo 2.5T 2003–2008"],
    ["case changed", "Volvo K24-k26 anpassad för 940-740", "Turbo Volvo K24-K26 till 940 / 740"],
    ["spaces inside the code", "Volvo K24-k26 anpassad för 940-740", "Volvo K24 - K26 turbo till 940-740"],
  ];
  for (const [label, original, candidate] of ok) {
    check(`accepted: ${label}`, preservesCodes(original, candidate), missingCodes(original, candidate));
  }

  /** A name with no codes at all imposes no constraint. */

  /** A digit pair may be written out; each side must still be there. */
  check(
    "a model pair written out is accepted",
    preservesCodes("Volvo K24-k26 anpassad för 940-740", "Turbo K24-K26 till Volvo 940 och 740"),
    missingCodes("Volvo K24-k26 anpassad för 940-740", "Turbo K24-K26 till Volvo 940 och 740"),
  );
  check(
    "a year range written out is accepted",
    preservesCodes("TD04L-19T Saab 9-3 2003-2010", "Turbo TD04L-19T Saab 9-3, 2003 till 2010"),
  );
  /** But dropping half of a pair still sells the wrong fitment. */
  check(
    "half a model pair is rejected",
    !preservesCodes("Volvo K24-k26 anpassad för 940-740", "Turbo K24-K26 till Volvo 940"),
    missingCodes("Volvo K24-k26 anpassad för 940-740", "Turbo K24-K26 till Volvo 940"),
  );
  /** An alphanumeric code is one unit and is NOT split. */
  check(
    "half an alphanumeric code is rejected",
    !preservesCodes("TD04HL-19T Upgrade", "Turbo TD04HL till Saab 9-3"),
  );

  check("a name with no codes accepts any rewrite", preservesCodes("Wastegate Saab AERO", "Helt annan text"));
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
