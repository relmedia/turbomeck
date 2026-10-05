#!/usr/bin/env node
/**
 * Repair double-encoded (mojibake) characters in `.env` files.
 *
 * Symptom this fixes: a value like `HisingsKärra` arrives as `HisingsKÃ¤rra`,
 * because the UTF-8 bytes `C3 A4` were read as Latin-1 and saved again as
 * UTF-8 (`C3 83 C2 A4`). It happens when an .env is edited or pasted through a
 * terminal that isn't UTF-8.
 *
 * It is not cosmetic: PostNord rejected every delivery-options request with
 * `400 Bad Request` because POSTNORD_WAREHOUSE_CITY on the server was damaged
 * this way, which took shipping options out of the cart entirely.
 *
 * Usage:
 *   node scripts/fix-env-mojibake.mjs apps/client/.env              # report only
 *   node scripts/fix-env-mojibake.mjs apps/client/.env --write      # fix, keeps .bak
 *   node scripts/fix-env-mojibake.mjs apps/*.env apps/*\/.env       # several at once
 *
 * After writing, restart the affected app so PM2 re-reads the file:
 *   pm2 restart ecosystem.config.js --only client --update-env
 */
import fs from "node:fs";

/**
 * Keys are the mojibake sequences, written as explicit code points so this
 * file's own encoding can never be the thing that breaks the repair.
 */
const PAIRS = [
  ["Ã¤", "ä"], // ä
  ["Ã¶", "ö"], // ö
  ["Ã¥", "å"], // å
  ["Ã", "Ä"], // Ä
  ["Ã", "Ö"], // Ö
  ["Ã", "Å"], // Å
  ["Ã©", "é"], // é
  ["Ã¸", "ø"], // ø
  ["Ã¦", "æ"], // æ
  ["Ã", "Ü"], // Ü
  ["Ã¼", "ü"], // ü
];

const args = process.argv.slice(2);
const write = args.includes("--write");
const files = args.filter((a) => !a.startsWith("--"));

if (files.length === 0) {
  console.error(
    "Usage: node scripts/fix-env-mojibake.mjs <file> [more files...] [--write]",
  );
  process.exit(1);
}

let totalFixed = 0;
let totalFiles = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`${file}: not found, skipping`);
    continue;
  }

  const original = fs.readFileSync(file, "utf8");
  let fixed = original;
  const changes = [];

  for (const [bad, good] of PAIRS) {
    if (!fixed.includes(bad)) continue;
    const count = fixed.split(bad).length - 1;
    changes.push(`${bad} -> ${good} (${count})`);
    fixed = fixed.split(bad).join(good);
  }

  if (changes.length === 0) {
    console.log(`${file}: clean`);
    continue;
  }

  totalFiles += 1;
  totalFixed += changes.length;
  console.log(`${file}: ${changes.join(", ")}`);

  // Show the affected lines (keys only on the left, so no secret is printed
  // unless the value itself is what changed).
  const beforeLines = original.split("\n");
  fixed.split("\n").forEach((line, i) => {
    if (line === beforeLines[i]) return;
    const key = line.split("=")[0];
    console.log(`  ${key}: ${beforeLines[i]?.split("=").slice(1).join("=")} -> ${line.split("=").slice(1).join("=")}`);
  });

  if (write) {
    fs.copyFileSync(file, `${file}.bak`);
    fs.writeFileSync(file, fixed, "utf8");
    console.log(`  written (backup: ${file}.bak)`);
  }
}

if (totalFiles === 0) {
  console.log("\nNothing to fix.");
} else if (!write) {
  console.log(`\n${totalFixed} substitution(s) in ${totalFiles} file(s). Re-run with --write to apply.`);
} else {
  console.log(
    `\n${totalFixed} substitution(s) in ${totalFiles} file(s) written.\n` +
      "Restart the affected apps: pm2 restart ecosystem.config.js --update-env",
  );
}
