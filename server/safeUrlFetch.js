import net from "node:net";
import dns from "node:dns/promises";

// IPv4 numerical representations: [start, end]
const FORBIDDEN_IPV4_RANGES = [
  // 0.0.0.0/8 (Current network / "this" network - RFC 1122)
  [0, 16777215],
  // 10.0.0.0/8 (Private - RFC 1918)
  [167772160, 184549375],
  // 100.64.0.0/10 (Shared address space / Carrier NAT - RFC 6598)
  [1681915904, 1686110207],
  // 127.0.0.0/8 (Loopback - RFC 1122)
  [2130706432, 2147483647],
  // 169.254.0.0/16 (Link-local / Cloud metadata - RFC 3927)
  [2851995648, 2852061183],
  // 172.16.0.0/12 (Private - RFC 1918)
  [2886729728, 2887778303],
  // 192.0.0.0/24 (IETF Protocol Assignments - RFC 6890)
  [3221225472, 3221225727],
  // 192.0.2.0/24 (TEST-NET-1 - RFC 5737)
  [3221225984, 3221226239],
  // 192.88.99.0/24 (6to4 Relay Anycast - RFC 3068)
  [3227017984, 3227018239],
  // 192.168.0.0/16 (Private - RFC 1918)
  [3232235520, 3232301055],
  // 198.18.0.0/15 (Benchmarking - RFC 2544)
  [3323068416, 3323199487],
  // 198.51.100.0/24 (TEST-NET-2 - RFC 5737)
  [3325256704, 3325256959],
  // 203.0.113.0/24 (TEST-NET-3 - RFC 5737)
  [3405803776, 3405804031],
  // 224.0.0.0/4 (Multicast - RFC 5771)
  [3758096384, 4026531839],
  // 240.0.0.0/4 (Reserved for future use & 255.255.255.255 Broadcast - RFC 1112)
  [4026531840, 4294967295],
];

export function parseIpv4ToNumber(ip) {
  if (typeof ip !== "string") return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    num = num * 256 + n;
  }
  return num;
}

export function isForbiddenIpv4(ip) {
  const num = parseIpv4ToNumber(ip);
  if (num === null) return true; // Invalid format treated as unsafe
  return FORBIDDEN_IPV4_RANGES.some(([start, end]) => num >= start && num <= end);
}

export function parseIpv6ToBigInt(ip) {
  if (typeof ip !== "string") return null;
  // Strip zone index (e.g. fe80::1%eth0)
  let clean = ip.split("%")[0].toLowerCase().trim();

  // Handle embedded IPv4 at end of IPv6 (e.g. ::ffff:192.168.1.1)
  const lastColon = clean.lastIndexOf(":");
  if (lastColon !== -1 && clean.slice(lastColon + 1).includes(".")) {
    const ipv4Part = clean.slice(lastColon + 1);
    const octets = ipv4Part.split(".").map(Number);
    if (octets.length === 4 && octets.every((o) => !isNaN(o) && o >= 0 && o <= 255)) {
      const hex1 = (((octets[0] << 8) | octets[1]) >>> 0).toString(16);
      const hex2 = (((octets[2] << 8) | octets[3]) >>> 0).toString(16);
      clean = `${clean.slice(0, lastColon)}:${hex1}:${hex2}`;
    } else {
      return null;
    }
  }

  const doubleColonIdx = clean.indexOf("::");
  let parts;
  if (doubleColonIdx !== -1) {
    if (clean.indexOf("::", doubleColonIdx + 2) !== -1) {
      return null; // Multiple :: invalid
    }
    const [left, right] = clean.split("::");
    const leftParts = left ? left.split(":") : [];
    const rightParts = right ? right.split(":") : [];
    const missing = 8 - (leftParts.length + rightParts.length);
    if (missing < 0) return null;
    parts = [...leftParts, ...Array(missing).fill("0"), ...rightParts];
  } else {
    parts = clean.split(":");
  }

  if (parts.length !== 8) return null;

  let big = 0n;
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    big = (big << 16n) | BigInt(parseInt(part, 16));
  }
  return big;
}

function inIpv6Cidr(ipBig, prefixStr, prefixLen) {
  const shift = 128n - BigInt(prefixLen);
  const mask =
    shift === 0n
      ? (1n << 128n) - 1n
      : (((1n << 128n) - 1n) >> shift) << shift;
  const prefixBig = parseIpv6ToBigInt(prefixStr);
  if (prefixBig === null) return false;
  return (ipBig & mask) === (prefixBig & mask);
}

export function isForbiddenIpv6(ip) {
  const ipBig = parseIpv6ToBigInt(ip);
  if (ipBig === null) return true;

  // 1. Check if IPv4-mapped IPv6 (::ffff:0:0/96)
  if (inIpv6Cidr(ipBig, "::ffff:0:0", 96)) {
    const embeddedIpv4Num = Number(ipBig & 0xffffffffn);
    return FORBIDDEN_IPV4_RANGES.some(
      ([start, end]) => embeddedIpv4Num >= start && embeddedIpv4Num <= end,
    );
  }

  // 2. Check if IPv4-translated IPv6 (::ffff:0:0:0/96)
  if (inIpv6Cidr(ipBig, "::ffff:0:0:0", 96)) {
    return true;
  }

  // 3. Unspecified (::/128) and Loopback (::1/128)
  if (ipBig === 0n || ipBig === 1n) return true;

  // 4. Unique Local Addresses (fc00::/7 - private IPv6)
  if (inIpv6Cidr(ipBig, "fc00::", 7)) return true;

  // 5. Link-local unicast (fe80::/10)
  if (inIpv6Cidr(ipBig, "fe80::", 10)) return true;

  // 6. Multicast (ff00::/8)
  if (inIpv6Cidr(ipBig, "ff00::", 8)) return true;

  // 7. Discard prefix (100::/64)
  if (inIpv6Cidr(ipBig, "100::", 64)) return true;

  // 8. Documentation / benchmark / 6to4
  if (inIpv6Cidr(ipBig, "2001:db8::", 32)) return true;
  if (inIpv6Cidr(ipBig, "2001::", 23)) return true;
  if (inIpv6Cidr(ipBig, "2002::", 16)) return true;
  if (inIpv6Cidr(ipBig, "64:ff9b::", 96)) return true;

  return false;
}

export function isForbiddenIp(ip) {
  if (net.isIPv4(ip)) return isForbiddenIpv4(ip);
  if (net.isIPv6(ip)) return isForbiddenIpv6(ip);
  return true;
}

const FORBIDDEN_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);
const FORBIDDEN_TLDS = [
  ".localhost",
  ".local",
  ".internal",
  ".arpa",
  ".onion",
  ".test",
  ".example",
  ".invalid",
];

async function defaultDnsLookup(hostname) {
  return dns.lookup(hostname, { all: true });
}

export async function validateExternalUrl(urlString, options = {}) {
  const lookupFn = options.lookupFn || defaultDnsLookup;

  if (!urlString || typeof urlString !== "string") {
    throw new Error("Please provide a valid recipe website URL.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlString.trim());
  } catch {
    throw new Error("Invalid URL format. Please provide a valid web address.");
  }

  // 1. Protocol: HTTPS only
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS website URLs are supported for security.");
  }

  // 2. Credentials: no username or password in URL
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }

  // 3. Port: standard 443 only (or empty)
  if (parsedUrl.port && parsedUrl.port !== "443") {
    throw new Error(`Custom ports (${parsedUrl.port}) are not allowed.`);
  }

  // 4. Hostname validation
  const rawHost = parsedUrl.hostname.trim().toLowerCase();
  if (!rawHost) {
    throw new Error("URL must include a valid hostname.");
  }

  // Strip brackets for IPv6 hostnames like [::1]
  const cleanHost = rawHost.replace(/^\[|\]$/g, "");

  if (FORBIDDEN_HOSTNAMES.has(cleanHost)) {
    throw new Error("Access to localhost is forbidden.");
  }

  if (FORBIDDEN_TLDS.some((tld) => cleanHost.endsWith(tld))) {
    throw new Error("Access to local or private domain names is forbidden.");
  }

  // 5. If host is already an IP address, validate directly
  if (net.isIP(cleanHost)) {
    if (isForbiddenIp(cleanHost)) {
      throw new Error("Access to private, loopback, or restricted IP addresses is forbidden.");
    }
    return parsedUrl;
  }

  // 6. DNS Resolution: resolve hostname and check all returned IPs
  let addresses;
  try {
    addresses = await lookupFn(cleanHost);
  } catch (err) {
    throw new Error(`Could not resolve hostname "${cleanHost}": ${err.message}`, {
      cause: err,
    });
  }

  if (!addresses || !addresses.length) {
    throw new Error(`Could not resolve hostname "${cleanHost}".`);
  }

  for (const entry of addresses) {
    const ip = typeof entry === "string" ? entry : entry.address;
    if (isForbiddenIp(ip)) {
      throw new Error(`Hostname "${cleanHost}" resolved to forbidden address "${ip}".`);
    }
  }

  return parsedUrl;
}

async function readStreamWithLimit(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    const byteLength = typeof Buffer !== "undefined" ? Buffer.byteLength(text) : text.length;
    if (byteLength > maxBytes) {
      throw new Error(`Website content exceeded maximum size limit (${Math.round(maxBytes / 1024)} KB).`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Ignore stream cancel error
        }
        throw new Error(`Website content exceeded maximum size limit (${Math.round(maxBytes / 1024)} KB).`);
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // Ignore release error
    }
  }
}

export async function safeFetchHtml(initialUrlString, options = {}) {
  const {
    maxRedirects = 3,
    timeoutMs = 8000,
    maxSizeBytes = 1.5 * 1024 * 1024, // 1.5 MB
    allowedContentTypes = [
      "text/html",
      "application/xhtml+xml",
      "text/xml",
      "application/xml",
    ],
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    lookupFn = defaultDnsLookup,
    fetchFn = globalThis.fetch,
  } = options;

  let currentUrl = initialUrlString;
  let redirectsCount = 0;

  while (true) {
    const validatedUrl = await validateExternalUrl(currentUrl, { lookupFn });

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`Website request timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    try {
      const response = await fetchFn(validatedUrl.href, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      // Handle redirects manually to re-validate each target
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectsCount >= maxRedirects) {
          throw new Error(`Exceeded maximum allowed redirects (${maxRedirects}).`);
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect response from "${validatedUrl.hostname}" missing Location header.`);
        }
        const nextUrl = new URL(location, validatedUrl.href).href;
        currentUrl = nextUrl;
        redirectsCount++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch website (${response.status} ${response.statusText || ""})`.trim());
      }

      // Validate Content-Type
      const rawContentType = response.headers.get("content-type") || "";
      const baseContentType = rawContentType.split(";")[0].trim().toLowerCase();
      if (baseContentType && !allowedContentTypes.includes(baseContentType)) {
        throw new Error(`Unsupported content type "${baseContentType}". Only HTML recipe pages are supported.`);
      }

      const html = await readStreamWithLimit(response, maxSizeBytes);
      return html;
    } finally {
      clearTimeout(timer);
    }
  }
}
