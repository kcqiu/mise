import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("vercel.json Security Headers", () => {
  const vercelConfig = JSON.parse(
    readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
  );

  const headersBlock = vercelConfig.headers?.find(
    (h) => h.source === "/(.*)",
  );

  it("defines standard security headers for all routes", () => {
    expect(headersBlock).toBeDefined();
    const headers = Object.fromEntries(
      headersBlock.headers.map((item) => [item.key, item.value]),
    );

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("configures enforced Content-Security-Policy with all required origins", () => {
    const headers = Object.fromEntries(
      headersBlock.headers.map((item) => [item.key, item.value]),
    );

    const csp = headers["Content-Security-Policy"];
    expect(csp).toBeDefined();

    // Key security controls
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");

    // Google Identity
    expect(csp).toContain("https://accounts.google.com/gsi/client");
    expect(csp).toContain("https://accounts.google.com/gsi/style");

    // Supabase
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");

    // Video embeds
    expect(csp).toContain("https://www.youtube-nocookie.com");
    expect(csp).toContain("https://www.instagram.com");
    expect(csp).toContain("https://www.tiktok.com");

    // Google Fonts
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
  });
});
