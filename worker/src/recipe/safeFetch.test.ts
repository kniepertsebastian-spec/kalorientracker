import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedUrlError, checkUrl, fetchPage, FetchFailedError, guardedLookup, isBlockedAddress } from "./safeFetch.js";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1", "127.8.9.10", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.178.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd00::1", "fc12::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1",
    "0:0:0:0:0:ffff:a9fe:a9fe", "::127.0.0.1", "64:ff9b::a00:1", "2002:7f00:1::", "ff02::1", "kein-ip",
  ])("%s is blocked", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["93.184.216.34", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8"])("%s is public", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("checkUrl", () => {
  it.each([
    "file:///etc/passwd", "ftp://example.org/x", "gopher://example.org", "javascript:alert(1)", "http://127.0.0.1/", "http://[::1]/",
    "http://169.254.169.254/latest/meta-data", "http://example.org:8080/", "http://example.org:22/", "http://user:pw@example.org/",
    "http://localhost/", "http://redis/", "http://0x7f000001/", "http://2130706433/", "kein link",
  ])("rejects %s", (url) => {
    expect(() => checkUrl(url)).toThrow(BlockedUrlError);
  });

  it("allows public http(s) links on standard ports", () => {
    expect(checkUrl("https://www.chefkoch.de/rezepte/1").hostname).toBe("www.chefkoch.de");
    expect(checkUrl("http://example.org:80/x").hostname).toBe("example.org");
  });
});

describe("fetchPage against a local server", () => {
  let server: Server;
  let base: string;
  let port: string;
  // The local server is on 127.0.0.1: allowed here through the test hooks, blocked by default.
  const opts = () => ({ isBlocked: () => false, allowedPorts: new Set([port]) });

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = req.url ?? "/";
      if (path === "/page") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<title>Käse</title>");
      if (path === "/latin1") return res.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" }).end(Buffer.from([0x4b, 0xe4, 0x73, 0x65]));
      if (path === "/gzip") return res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }).end(gzipSync("<p>gepackt</p>"));
      if (path === "/big") return res.writeHead(200, { "content-type": "text/html" }).end("x".repeat(5000));
      if (path === "/image") return res.writeHead(200, { "content-type": "image/png" }).end("png");
      if (path === "/missing") return res.writeHead(404).end();
      if (path === "/redirect") return res.writeHead(302, { location: "/page" }).end();
      if (path === "/loop") return res.writeHead(302, { location: "/loop" }).end();
      if (path === "/to-metadata") return res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" }).end();
      if (path === "/to-other-port") return res.writeHead(302, { location: "http://example.org:6379/" }).end();
      if (path === "/slow") return setTimeout(() => res.end("spät"), 2000);
      res.writeHead(500).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = String((server.address() as AddressInfo).port);
    base = `http://127.0.0.1:${port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("blocks the local server with the default rules", async () => {
    await expect(fetchPage(`${base}/page`, { allowedPorts: new Set([port]) })).rejects.toThrow(BlockedUrlError);
  });

  it("checks the resolved address inside the socket's DNS lookup", async () => {
    const lookup = guardedLookup(isBlockedAddress);
    const result = (all: boolean) =>
      new Promise((resolve) => lookup("localhost", { all }, (error, address) => resolve(error ? `error:${(error as { code?: string }).code}` : address)));
    expect(await result(false)).toBe("error:EBLOCKED");
    expect(await result(true)).toBe("error:EBLOCKED");
    const open = guardedLookup(() => false);
    const address = await new Promise((resolve) => open("localhost", {}, (_e, a) => resolve(a)));
    expect(["127.0.0.1", "::1"]).toContain(address);
  });

  it("reads a page and decodes its charset", async () => {
    expect((await fetchPage(`${base}/page`, opts())).body).toBe("<title>Käse</title>");
    expect((await fetchPage(`${base}/latin1`, opts())).body).toBe("Käse");
    expect((await fetchPage(`${base}/gzip`, opts())).body).toBe("<p>gepackt</p>");
  });

  it("follows redirects and checks every hop", async () => {
    expect((await fetchPage(`${base}/redirect`, opts())).url).toBe(`${base}/page`);
    await expect(fetchPage(`${base}/loop`, opts())).rejects.toThrow("Zu viele Weiterleitungen");
    await expect(fetchPage(`${base}/to-metadata`, { allowedPorts: new Set([port]), isBlocked: (a: string) => a !== "127.0.0.1" })).rejects.toThrow(BlockedUrlError);
    await expect(fetchPage(`${base}/to-other-port`, opts())).rejects.toThrow(BlockedUrlError);
  });

  it("stops at the size limit and the timeout, refuses non-pages and errors", async () => {
    const big = await fetchPage(`${base}/big`, { ...opts(), maxBytes: 1000 });
    expect(big.body).toHaveLength(1000);
    expect(big.truncated).toBe(true);
    await expect(fetchPage(`${base}/slow`, { ...opts(), timeoutMs: 200 })).rejects.toThrow("Zeitüberschreitung");
    await expect(fetchPage(`${base}/image`, opts())).rejects.toThrow(FetchFailedError);
    await expect(fetchPage(`${base}/missing`, opts())).rejects.toThrow("HTTP 404");
  });
});
