#!/usr/bin/env node
/**
 * Run on the VPS:  node apps/admin/scripts/postnord-dns-check.mjs
 *
 * Confirms whether Node’s libc resolver (used by global fetch) and Node’s direct dns.Resolver
 * (used by postnordFetch when POSTNORD_DNS_SERVERS / POSTNORD_DNS_BYPASS_GETADDRINFO is set)
 * can both resolve PostNord hostnames.
 */
import dns from "node:dns";

const HOSTS = [
  "gate.ess.postnord.com",
  "pp-gate.ess.postnord.com",
  "api2.postnord.com",
  "atapi2.postnord.com",
];

const SERVERS = (process.env.POSTNORD_DNS_SERVERS ?? "1.1.1.1,8.8.8.8")
  .split(/[,;\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Direct DNS servers under test: ${SERVERS.join(", ")}\n`);

const resolver = new dns.promises.Resolver();
resolver.setServers(SERVERS);

for (const host of HOSTS) {
  process.stdout.write(`${host}\n`);
  try {
    const lookup = await dns.promises.lookup(host);
    process.stdout.write(`  libc getaddrinfo : ${lookup.address} (family ${lookup.family})\n`);
  } catch (e) {
    process.stdout.write(`  libc getaddrinfo : FAIL — ${e?.code ?? ""} ${e?.message ?? e}\n`);
  }
  try {
    const a = await resolver.resolve4(host);
    process.stdout.write(`  resolver.resolve4 : ${a.join(", ")}\n`);
  } catch (e) {
    process.stdout.write(`  resolver.resolve4 : FAIL — ${e?.code ?? ""} ${e?.message ?? e}\n`);
  }
  process.stdout.write("\n");
}
