/**
 * PostNord-only HTTP client that bypasses libc `getaddrinfo` when needed.
 *
 * Why: Node's global `fetch` uses `dns.lookup` which delegates to libc — it ignores `dns.setServers()`.
 * On hosts where `dig @1.1.1.1 gate.ess.postnord.com` works but `node` returns ENOTFOUND, this lets us
 * keep talking to PostNord without changing system DNS for the whole VM.
 *
 * Activation:
 *   - Auto-on whenever POSTNORD_DNS_SERVERS is set (e.g. `1.1.1.1,8.8.8.8`), or
 *   - POSTNORD_DNS_BYPASS_GETADDRINFO=true to use the system resolver via `dns.promises.Resolver`
 *     (which still avoids libc and uses direct UDP/TCP queries).
 *   - POSTNORD_DNS_IPV4_FIRST=true forces IPv4 first when ipv6 routing is broken.
 */

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { URL as NodeURL } from "node:url";

type FetchInit = {
  method?: string;
  headers?: Record<string, string> | Headers;
  body?: string;
};

let dnsApplied = false;
let resolverConfigured = false;
const resolver = new dns.promises.Resolver();

function isOn(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function bypassEnabled(): boolean {
  if (isOn("POSTNORD_DNS_BYPASS_GETADDRINFO")) return true;
  const servers = process.env.POSTNORD_DNS_SERVERS?.trim();
  return !!servers;
}

function applyDnsSetupOnce(): void {
  if (dnsApplied) return;
  dnsApplied = true;
  if (
    isOn("POSTNORD_DNS_IPV4_FIRST") &&
    typeof dns.setDefaultResultOrder === "function"
  ) {
    dns.setDefaultResultOrder("ipv4first");
  }
}

function configureResolverOnce(): void {
  if (resolverConfigured) return;
  resolverConfigured = true;
  const raw = process.env.POSTNORD_DNS_SERVERS?.trim();
  if (!raw) return;
  const servers = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length) {
    try {
      resolver.setServers(servers);
    } catch {
      /* invalid entries — silently ignore so app does not crash */
    }
  }
}

/** Custom DNS resolution that uses dns.Resolver (UDP/TCP to configured servers) instead of libc getaddrinfo. */
const customLookup: LookupFunction = (hostname, options, callback) => {
  configureResolverOnce();
  const wantAll = typeof options === "object" && options !== null && options.all === true;

  const finishOne = (
    errSoFar: NodeJS.ErrnoException | null,
    address?: string,
    family?: number,
  ) => {
    if (address && family) {
      if (wantAll) {
        (callback as (e: NodeJS.ErrnoException | null, a: { address: string; family: number }[]) => void)(
          null,
          [{ address, family }],
        );
      } else {
        (callback as (e: NodeJS.ErrnoException | null, a: string, f: number) => void)(null, address, family);
      }
      return;
    }
    (callback as (e: NodeJS.ErrnoException | null) => void)(
      errSoFar ?? Object.assign(new Error(`No record for ${hostname}`), { code: "ENOTFOUND" }),
    );
  };

  const v4First = isOn("POSTNORD_DNS_IPV4_FIRST");
  const tryV4 = (errSoFar: NodeJS.ErrnoException | null) =>
    resolver.resolve4(hostname).then(
      (addrs) => finishOne(errSoFar, addrs[0], 4),
      (err: NodeJS.ErrnoException) => finishOne(errSoFar ?? err),
    );
  const tryV6 = (errSoFar: NodeJS.ErrnoException | null) =>
    resolver.resolve6(hostname).then(
      (addrs) => {
        if (addrs && addrs.length > 0) {
          finishOne(null, addrs[0], 6);
          return;
        }
        tryV4(errSoFar);
      },
      (err: NodeJS.ErrnoException) => {
        if (err.code === "ENODATA" || err.code === "ENOTFOUND") {
          tryV4(errSoFar);
          return;
        }
        tryV4(err);
      },
    );

  if (v4First) {
    resolver.resolve4(hostname).then(
      (addrs) => {
        if (addrs && addrs.length > 0) {
          finishOne(null, addrs[0], 4);
          return;
        }
        tryV6(null);
      },
      (err: NodeJS.ErrnoException) => {
        if (err.code === "ENODATA" || err.code === "ENOTFOUND") {
          tryV6(null);
          return;
        }
        tryV6(err);
      },
    );
  } else {
    tryV6(null);
  }
};

function headersToObject(h: FetchInit["headers"]): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  return { ...h };
}

/**
 * fetch-compatible client for PostNord — uses a custom DNS lookup when the env enables it,
 * otherwise falls back to global fetch.
 */
export async function postnordFetch(
  targetUrl: string,
  init: FetchInit = {},
): Promise<Response> {
  applyDnsSetupOnce();

  if (!bypassEnabled()) {
    return fetch(targetUrl, init as RequestInit);
  }

  const u = new NodeURL(targetUrl);
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return fetch(targetUrl, init as RequestInit);
  }

  return new Promise<Response>((resolve, reject) => {
    const transport = u.protocol === "https:" ? https : http;
    const headers = headersToObject(init.headers);
    if (init.body != null && headers["Content-Length"] == null && headers["content-length"] == null) {
      headers["Content-Length"] = String(Buffer.byteLength(init.body));
    }

    const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    const req = transport.request(
      {
        method: init.method || "GET",
        hostname: u.hostname,
        port,
        path: `${u.pathname}${u.search}`,
        headers,
        lookup: customLookup,
        servername: u.hostname,
      } as https.RequestOptions,
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const responseHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) {
              for (const vi of v) responseHeaders.append(k, String(vi));
            } else if (v != null) {
              responseHeaders.set(k, String(v));
            }
          }
          const status = res.statusCode ?? 0;
          /** Status 204/205/304 must not have a body in the Response. */
          const bodyForResponse = status === 204 || status === 205 || status === 304 ? null : body;
          resolve(
            new Response(bodyForResponse, {
              status,
              statusText: res.statusMessage ?? "",
              headers: responseHeaders,
            }),
          );
        });
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

/** Back-compat: previous module just exported this — keep so old imports keep working. */
export function applyPostnordNodeDnsOverridesOnce(): void {
  applyDnsSetupOnce();
  configureResolverOnce();
}
