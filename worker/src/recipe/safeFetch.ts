import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";

// Fetches a public web page for the recipe import. The URL comes from a user, so the worker must
// not become a way into the server's own network (SSRF): only http(s) on ports 80/443, every
// address a host name resolves to is checked against private, loopback, link-local and other
// non-public ranges, and the check happens inside the socket's own DNS lookup, so the address
// that is checked is the address that is connected to (no DNS rebinding between check and use).
// Redirects are followed by hand (max 5) and each hop is checked again. At most 2 MB of the
// (decompressed) body is read, and the whole fetch takes at most 15 s.

export const MAX_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; RecipeImport/1.0)";

// Two lists: a BlockList also matches IPv4 addresses against IPv6 rules (as ::ffff:a.b.c.d).
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked4.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked6.addSubnet(net, prefix, "ipv6");

/** True for any address that is not a public unicast address. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked4.check(address, "ipv4");
  if (family === 6) {
    // The URL parser writes every IPv6 address in one canonical form (compressed, lower case,
    // IPv4-mapped as ::ffff:hhhh:hhhh), so the mapped check below can't be dodged by spelling.
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
    if (mapped) {
      const hi = parseInt(mapped[1]!, 16);
      const lo = parseInt(mapped[2]!, 16);
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return blocked6.check(canonical, "ipv6");
  }
  return true;
}

export class BlockedUrlError extends Error {}
export class FetchFailedError extends Error {}

export interface FetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  /** Tests only: a local server. */
  isBlocked?: (address: string) => boolean;
  allowedPorts?: ReadonlySet<string>;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

const DEFAULT_PORTS = new Set(["", "80", "443"]);

export function checkUrl(raw: string, options: FetchOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Ungültiger Link");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("Nur http- und https-Links");
  if (url.username || url.password) throw new BlockedUrlError("Links mit Zugangsdaten werden nicht geöffnet");
  if (!(options.allowedPorts ?? DEFAULT_PORTS).has(url.port)) throw new BlockedUrlError("Nur die Standard-Ports 80 und 443");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && (options.isBlocked ?? isBlockedAddress)(host)) throw new BlockedUrlError("Adresse nicht erlaubt");
  if (!host.includes(".") && !isIP(host)) throw new BlockedUrlError("Adresse nicht erlaubt");
  return url;
}

export function guardedLookup(isBlocked: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, "", 0);
      const list = addresses as unknown as LookupAddress[];
      if (list.length === 0 || list.some((a) => isBlocked(a.address))) {
        return callback(Object.assign(new BlockedUrlError("Adresse nicht erlaubt"), { code: "EBLOCKED" }), "", 0);
      }
      if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

function charsetOf(contentType: string): string {
  const m = /charset=["']?([\w-]+)/i.exec(contentType);
  const charset = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return "utf-8";
  }
}

function requestOnce(url: URL, options: Required<Pick<FetchOptions, "maxBytes">> & FetchOptions, signal: AbortSignal): Promise<{ status: number; location?: string; contentType: string; body?: Buffer; truncated: boolean }> {
  const isBlocked = options.isBlocked ?? isBlockedAddress;
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup(isBlocked),
        signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5", "accept-encoding": "gzip, deflate, br", "accept-language": "de,en;q=0.8" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType, truncated: false });
        }
        if (/^(image|video|audio|font)\//i.test(contentType) || /application\/(octet-stream|pdf|zip)/i.test(contentType)) {
          res.destroy();
          return reject(new FetchFailedError(`Keine Webseite (${contentType.split(";")[0]})`));
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: Readable = res;
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(createGunzip());
        else if (encoding === "deflate") stream = res.pipe(createInflate());
        else if (encoding === "br") stream = res.pipe(createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          const room = options.maxBytes - size;
          if (chunk.length >= room) {
            chunks.push(chunk.subarray(0, room));
            size += room;
            truncated = true;
            res.destroy();
            resolve({ status, contentType, body: Buffer.concat(chunks), truncated });
            return;
          }
          chunks.push(chunk);
          size += chunk.length;
        });
        stream.on("end", () => resolve({ status, contentType, body: Buffer.concat(chunks), truncated }));
        stream.on("error", (error) => (truncated ? undefined : reject(new FetchFailedError(error.message))));
      },
    );
    req.on("error", (error) => reject(error instanceof BlockedUrlError || (error as { code?: string }).code === "EBLOCKED" ? new BlockedUrlError("Adresse nicht erlaubt") : new FetchFailedError(error.message)));
    req.end();
  });
}

export async function fetchPage(raw: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const opts = { ...options, maxBytes: options.maxBytes ?? MAX_BYTES };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    let url = checkUrl(raw, options);
    for (let hop = 0; ; hop++) {
      let res;
      try {
        res = await requestOnce(url, opts, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw new FetchFailedError("Zeitüberschreitung");
        throw error;
      }
      if (res.location) {
        if (hop >= MAX_REDIRECTS) throw new FetchFailedError("Zu viele Weiterleitungen");
        url = checkUrl(new URL(res.location, url).toString(), options);
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new FetchFailedError(`HTTP ${res.status}`);
      const body = new TextDecoder(charsetOf(res.contentType)).decode(res.body);
      return { url: url.toString(), status: res.status, contentType: res.contentType, body, truncated: res.truncated };
    }
  } finally {
    clearTimeout(timer);
  }
}
