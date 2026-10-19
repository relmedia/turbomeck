/**
 * PASS/FAIL checks for getPostNordBookingConfigStatus, in the style of
 * packages/shipping/src/__verify.ts.
 *
 *   node node_modules/.pnpm/tsx@*\/node_modules/tsx/dist/cli.mjs \
 *     apps/admin/src/lib/__verify-postnord-config-status.ts
 *
 * The first case is the regression test for the reported bug: it is the exact
 * environment the production server has today, and it must report not-ready.
 */

const POSTNORD_KEYS = [
  "POSTNORD_API_KEY",
  "POSTNORD_CLIENT_ID",
  "POSTNORD_CLIENT_SECRET",
  "POSTNORD_OAUTH_SCOPE",
  "POSTNORD_OAUTH_TOKEN_URL",
  "POSTNORD_SKIP_OAUTH",
  "POSTNORD_OAUTH_REQUIRED",
  "POSTNORD_USE_TEST_API",
  "POSTNORD_API_HOST",
  "POSTNORD_EDI_CUSTOMER_NUMBER",
  "POSTNORD_CONSIGNOR_COMPANY_NAME",
  "POSTNORD_CONSIGNOR_STREET",
  "POSTNORD_CONSIGNOR_POSTAL_CODE",
  "POSTNORD_CONSIGNOR_CITY",
  "POSTNORD_EDI_BASIC_SERVICE_CODE",
  "POSTNORD_EDI_DESTINATION_COUNTRIES",
  "NEXT_PUBLIC_POSTNORD_EDI_DESTINATION_COUNTRIES",
  "POSTNORD_EDI_TEST",
];

function withEnv<T>(env: Record<string, string>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of POSTNORD_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const k of POSTNORD_KEYS) {
      delete process.env[k];
      if (saved[k] !== undefined) process.env[k] = saved[k];
    }
  }
}

/** The five variables a real booking cannot go out without. */
const FULLY_CONFIGURED = {
  POSTNORD_API_KEY: "k",
  POSTNORD_EDI_CUSTOMER_NUMBER: "123456",
  POSTNORD_CONSIGNOR_COMPANY_NAME: "Turbomeck",
  POSTNORD_CONSIGNOR_STREET: "Testgatan 1",
  POSTNORD_CONSIGNOR_POSTAL_CODE: "41111",
  POSTNORD_CONSIGNOR_CITY: "Göteborg",
  POSTNORD_EDI_BASIC_SERVICE_CODE: "52",
  POSTNORD_SKIP_OAUTH: "true",
  POSTNORD_USE_TEST_API: "true",
};

async function main() {
  const { getPostNordBookingConfigStatus } = await import("./postnord-config-status.js");

  let fail = 0;
  const check = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fail += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)}` +
        (ok ? "" : ` (want ${JSON.stringify(want)})`),
    );
  };

  console.log("--- the production server's env today (the reported bug)");
  // Exactly what apps/admin/.env has on the server: key + OAuth creds, nothing else.
  const live = withEnv(
    {
      POSTNORD_API_KEY: "k",
      POSTNORD_CLIENT_ID: "cid",
      POSTNORD_CLIENT_SECRET: "secret",
      POSTNORD_OAUTH_SCOPE: "scope",
    },
    getPostNordBookingConfigStatus,
  );
  check("ready", live.ready, false);
  check(
    "blocking keys",
    live.blocking.map((c) => c.key).sort(),
    [
      "POSTNORD_CONSIGNOR_CITY",
      "POSTNORD_CONSIGNOR_COMPANY_NAME",
      "POSTNORD_CONSIGNOR_POSTAL_CODE",
      "POSTNORD_CONSIGNOR_STREET",
      "POSTNORD_EDI_BASIC_SERVICE_CODE",
      "POSTNORD_EDI_CUSTOMER_NUMBER",
    ],
  );
  check("API key not reported missing", live.blocking.some((c) => c.key === "POSTNORD_API_KEY"), false);
  check("oauth will be attempted", live.oauth.willAttempt, true);
  check("…against a dead host", live.oauth.usesDeadHost, true);
  check("warns about the dead host", live.warnings.some((c) => c.key === "POSTNORD_SKIP_OAUTH"), true);
  check("warns it points at production", live.warnings.some((c) => c.key === "POSTNORD_USE_TEST_API"), true);
  check("mode", live.mode, "production");
  check("host", live.host, "api2.postnord.com");

  console.log("\n--- no secret values are ever returned");
  const serialized = JSON.stringify(live);
  check("api key value absent", serialized.includes('"k"'), false);
  check("client secret absent", serialized.includes("secret"), false);

  console.log("\n--- fully configured against the test API");
  const good = withEnv(FULLY_CONFIGURED, getPostNordBookingConfigStatus);
  check("ready", good.ready, true);
  check("blocking empty", good.blocking.length, 0);
  check("mode", good.mode, "test");
  check("host", good.host, "atapi2.postnord.com");
  check("testIndicator", good.testIndicator, true);
  check("oauth skipped", good.oauth.willAttempt, false);
  check("no dead-host warning", good.warnings.some((c) => c.key === "POSTNORD_SKIP_OAUTH"), false);

  console.log("\n--- fallbacks that look configured are treated as missing");
  const sender = withEnv(
    { ...FULLY_CONFIGURED, POSTNORD_CONSIGNOR_COMPANY_NAME: "Sender" },
    getPostNordBookingConfigStatus,
  );
  check('company "Sender" blocks', sender.blocking.map((c) => c.key), ["POSTNORD_CONSIGNOR_COMPANY_NAME"]);
  const senderCase = withEnv(
    { ...FULLY_CONFIGURED, POSTNORD_CONSIGNOR_COMPANY_NAME: "sender" },
    getPostNordBookingConfigStatus,
  );
  check('…case-insensitively', senderCase.ready, false);

  console.log("\n--- partial consignor address is the same as none");
  const partial = withEnv(
    { ...FULLY_CONFIGURED, POSTNORD_CONSIGNOR_CITY: "" },
    getPostNordBookingConfigStatus,
  );
  check("missing city blocks", partial.blocking.map((c) => c.key), ["POSTNORD_CONSIGNOR_CITY"]);

  console.log("\n--- country list");
  const def = withEnv(FULLY_CONFIGURED, getPostNordBookingConfigStatus);
  check("defaults", def.destinationCountries, ["SE", "NO", "DK"]);
  const custom = withEnv(
    { ...FULLY_CONFIGURED, POSTNORD_EDI_DESTINATION_COUNTRIES: "se, no" },
    getPostNordBookingConfigStatus,
  );
  check("parsed + uppercased", custom.destinationCountries, ["SE", "NO"]);
  const drift = withEnv(
    {
      ...FULLY_CONFIGURED,
      POSTNORD_EDI_DESTINATION_COUNTRIES: "SE",
      NEXT_PUBLIC_POSTNORD_EDI_DESTINATION_COUNTRIES: "SE,NO,DK",
    },
    getPostNordBookingConfigStatus,
  );
  check(
    "drift is warned about",
    drift.warnings.some((c) => c.key === "NEXT_PUBLIC_POSTNORD_EDI_DESTINATION_COUNTRIES"),
    true,
  );

  console.log(fail === 0 ? "\nAll checks passed." : `\n${fail} check(s) FAILED.`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
