import { EventEmitter } from "node:events";
import https from "node:https";
import { describe, expect, it, vi } from "vitest";
import {
  isForbiddenIp,
  isForbiddenIpv4,
  isForbiddenIpv6,
  pinnedHttpsFetch,
  readStreamWithLimit,
  safeFetchHtml,
  validateExternalUrl,
} from "./safeUrlFetch.js";

describe("safeUrlFetch - IP address checks", () => {
  describe("IPv4", () => {
    it.each([
      "0.0.0.0",
      "0.255.255.255",
      "10.0.0.1",
      "10.255.255.254",
      "100.64.0.1",
      "100.127.255.254",
      "127.0.0.1",
      "127.255.255.255",
      "169.254.169.254",
      "169.254.1.1",
      "172.16.0.1",
      "172.31.255.254",
      "192.0.0.1",
      "192.0.2.1",
      "192.88.99.1",
      "192.168.0.1",
      "192.168.100.50",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "239.255.255.255",
      "240.0.0.1",
      "255.255.255.255",
    ])("blocks forbidden / private IPv4: %s", (ip) => {
      expect(isForbiddenIpv4(ip)).toBe(true);
      expect(isForbiddenIp(ip)).toBe(true);
    });

    it.each([
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "172.15.255.255",
      "172.32.0.1",
      "192.169.0.1",
    ])("allows legitimate public IPv4: %s", (ip) => {
      expect(isForbiddenIpv4(ip)).toBe(false);
      expect(isForbiddenIp(ip)).toBe(false);
    });
  });

  describe("IPv6", () => {
    it.each([
      "::",
      "::1",
      "fe80::1",
      "fe80::200:5aee:feaa:20a2",
      "fc00::1",
      "fd12:3456:789a:1::1",
      "ff02::1",
      "100::1",
      "2001:db8::1",
      "2002:c0a8:0101::",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:10.0.0.1",
      "::ffff:192.168.1.1",
    ])("blocks forbidden / private IPv6: %s", (ip) => {
      expect(isForbiddenIpv6(ip)).toBe(true);
      expect(isForbiddenIp(ip)).toBe(true);
    });

    it.each([
      "2607:f8b0:4005:805::200e",
      "2a00:1450:4009:81f::200e",
      "::ffff:8.8.8.8",
      "::ffff:1.1.1.1",
    ])("allows legitimate public IPv6: %s", (ip) => {
      expect(isForbiddenIpv6(ip)).toBe(false);
      expect(isForbiddenIp(ip)).toBe(false);
    });
  });
});

describe("safeUrlFetch - validateExternalUrl", () => {
  const publicLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

  it("accepts valid public HTTPS URL", async () => {
    const url = await validateExternalUrl("https://example.com/recipe/pasta", {
      lookupFn: publicLookup,
    });
    expect(url.href).toBe("https://example.com/recipe/pasta");
  });

  it("allows port 443 explicitly", async () => {
    const url = await validateExternalUrl("https://example.com:443/recipe", {
      lookupFn: publicLookup,
    });
    expect(url.hostname).toBe("example.com");
  });

  it("rejects non-HTTPS schemes", async () => {
    await expect(validateExternalUrl("http://example.com/recipe")).rejects.toThrow(
      /Only HTTPS website URLs are supported/i,
    );
    await expect(validateExternalUrl("ftp://example.com/recipe")).rejects.toThrow(
      /Only HTTPS website URLs are supported/i,
    );
    await expect(validateExternalUrl("file:///etc/passwd")).rejects.toThrow(
      /Only HTTPS website URLs are supported/i,
    );
  });

  it("rejects embedded credentials", async () => {
    await expect(
      validateExternalUrl("https://admin:secret@example.com/recipe"),
    ).rejects.toThrow(/credentials are not allowed/i);
  });

  it("rejects non-standard ports", async () => {
    await expect(validateExternalUrl("https://example.com:8080/recipe")).rejects.toThrow(
      /Custom ports \(8080\) are not allowed/i,
    );
    await expect(validateExternalUrl("https://example.com:22/recipe")).rejects.toThrow(
      /Custom ports \(22\) are not allowed/i,
    );
  });

  it.each([
    "https://localhost/recipe",
    "https://localhost.localdomain/recipe",
    "https://printer.local/recipe",
    "https://metadata.internal/recipe",
    "https://secret.onion/recipe",
    "https://test.test/recipe",
  ])("rejects restricted hostnames: %s", async (input) => {
    await expect(validateExternalUrl(input)).rejects.toThrow(
      /forbidden/i,
    );
  });

  it.each([
    "https://127.0.0.1/recipe",
    "https://10.0.0.1/recipe",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/recipe",
    "https://[fe80::1]/recipe",
    "https://[::ffff:127.0.0.1]/recipe",
  ])("rejects raw private IP hosts: %s", async (input) => {
    await expect(validateExternalUrl(input)).rejects.toThrow(
      /Access to private, loopback, or restricted IP addresses is forbidden/i,
    );
  });

  it("rejects hostnames resolving to private IPs", async () => {
    const privateLookup = vi.fn().mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      validateExternalUrl("https://legit-looking-domain.com", {
        lookupFn: privateLookup,
      }),
    ).rejects.toThrow(/resolved to forbidden address "127.0.0.1"/i);
  });

  it("rejects hostnames with dual-stack where one IP is private", async () => {
    const dualStackLookup = vi.fn().mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "::1", family: 6 },
    ]);
    await expect(
      validateExternalUrl("https://dual-stack-test.com", {
        lookupFn: dualStackLookup,
      }),
    ).rejects.toThrow(/resolved to forbidden address "::1"/i);
  });

  it("rejects hostnames that fail DNS resolution", async () => {
    const failingLookup = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    await expect(
      validateExternalUrl("https://nonexistent-domain-12345.xyz", {
        lookupFn: failingLookup,
      }),
    ).rejects.toThrow(/Could not resolve hostname/i);
  });
});

describe("safeUrlFetch - safeFetchHtml", () => {
  const mockLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

  it("fetches and returns HTML content for valid public site", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      text: async () => "<html><body><h1>Delicious Soup</h1></body></html>",
    });

    const result = await safeFetchHtml("https://example.com/soup", {
      lookupFn: mockLookup,
      fetchFn: mockFetch,
    });

    expect(result).toBe("<html><body><h1>Delicious Soup</h1></body></html>");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/soup",
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
      }),
    );
  });

  it("follows safe HTTPS redirect to public destination", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 301,
        headers: new Headers({ location: "https://example.com/final-soup" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "<html><body><h1>Final Soup</h1></body></html>",
      });

    const result = await safeFetchHtml("https://example.com/initial-soup", {
      lookupFn: mockLookup,
      fetchFn: mockFetch,
    });

    expect(result).toBe("<html><body><h1>Final Soup</h1></body></html>");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("blocks redirect that targets HTTP or private IP (SSRF redirect attack)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: new Headers({ location: "http://127.0.0.1:8080/admin" }),
    });

    await expect(
      safeFetchHtml("https://example.com/trick", {
        lookupFn: mockLookup,
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(/Only HTTPS website URLs are supported/i);
  });

  it("blocks redirect to internal cloud metadata IP", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: new Headers({ location: "https://169.254.169.254/latest/meta-data/" }),
    });

    await expect(
      safeFetchHtml("https://example.com/trick", {
        lookupFn: mockLookup,
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(/Access to private, loopback, or restricted IP addresses is forbidden/i);
  });

  it("rejects redirect loop that exceeds maxRedirects", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 302,
      headers: new Headers({ location: "https://example.com/loop" }),
    });

    await expect(
      safeFetchHtml("https://example.com/loop", {
        lookupFn: mockLookup,
        fetchFn: mockFetch,
        maxRedirects: 2,
      }),
    ).rejects.toThrow(/Exceeded maximum allowed redirects \(2\)/i);
  });

  it("rejects disallowed content-types (e.g. application/pdf)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      text: async () => "%PDF-1.5...",
    });

    await expect(
      safeFetchHtml("https://example.com/recipe.pdf", {
        lookupFn: mockLookup,
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(/Unsupported content type "application\/pdf"/i);
  });

  it("enforces maximum response size limit (DoS protection)", async () => {
    const largeBody = "A".repeat(2000);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => largeBody,
    });

    await expect(
      safeFetchHtml("https://example.com/massive-page", {
        lookupFn: mockLookup,
        fetchFn: mockFetch,
        maxSizeBytes: 1000, // 1 KB limit
      }),
    ).rejects.toThrow(/exceeded maximum size limit/i);
  });

  it("cancels web stream reader when chunk bytes exceed limit in readStreamWithLimit", async () => {
    const cancelMock = vi.fn().mockResolvedValue(undefined);
    const releaseLockMock = vi.fn();
    const encoder = new TextEncoder();
    let chunkCount = 0;

    const mockResponse = {
      body: {
        getReader: () => ({
          read: vi.fn().mockImplementation(async () => {
            chunkCount++;
            if (chunkCount === 1) {
              return { done: false, value: encoder.encode("small chunk ") };
            }
            if (chunkCount === 2) {
              return { done: false, value: encoder.encode("overflow chunk that exceeds limit") };
            }
            return { done: true, value: undefined };
          }),
          cancel: cancelMock,
          releaseLock: releaseLockMock,
        }),
      },
    };

    await expect(readStreamWithLimit(mockResponse, 15)).rejects.toThrow(/exceeded maximum size limit/i);
    expect(cancelMock).toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalled();
  });

  it("destroys socket immediately when pinnedHttpsFetch receives chunks exceeding maxSizeBytes", async () => {
    const destroyMock = vi.fn();
    const reqMock = new EventEmitter();
    reqMock.end = vi.fn();

    const httpsSpy = vi.spyOn(https, "request").mockImplementation((_url, _opts, callback) => {
      const resMock = new EventEmitter();
      resMock.statusCode = 200;
      resMock.statusMessage = "OK";
      resMock.headers = { "content-type": "text/html" };
      resMock.destroy = destroyMock;

      resMock[Symbol.asyncIterator] = async function* () {
        yield Buffer.from("small chunk 1 - 18B");
        yield Buffer.from("massive chunk 2 that blows past the max size threshold");
      };

      setTimeout(() => callback(resMock), 0);
      return reqMock;
    });

    try {
      const res = await pinnedHttpsFetch("https://example.com/stream-test", {
        pinnedIp: "93.184.216.34",
        maxSizeBytes: 20, // 20 bytes threshold
      });

      await expect(res.text()).rejects.toThrow(/exceeded maximum size limit/i);
      expect(destroyMock).toHaveBeenCalledTimes(1);
    } finally {
      httpsSpy.mockRestore();
    }
  });
});
