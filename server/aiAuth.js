import { createClient } from "@supabase/supabase-js";
import net from "node:net";
import crypto from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://spalxnqfgizpkeqxpxwv.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_8XRvxdQmezjsgSmhGAHDsA_MG5nf_08";

function getSupabaseClient() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    DEFAULT_SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_KEY ||
    DEFAULT_SUPABASE_KEY;

  return createClient(url.trim(), key.trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getServiceRoleSupabaseClient() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    DEFAULT_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  return createClient(url.trim(), serviceRoleKey.trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function isJwtStructurallyValid(token, allowTestTokens = process.env.NODE_ENV === "test") {
  if (!token || typeof token !== "string") return false;
  if (allowTestTokens && !token.includes(".")) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  return parts.every((p) => p.length > 0 && base64UrlRegex.test(p));
}

export async function verifySupabaseToken(token, options = {}) {
  if (!token || typeof token !== "string") {
    return { user: null, error: new Error("Missing token") };
  }

  // Support mocked test sessions during test runs without live network latency
  if (process.env.NODE_ENV === "test") {
    if (token === "test-valid-token") {
      return {
        user: { id: "test-user-id", email: "test@example.com" },
        error: null,
      };
    }
    if (token === "test-owner-token") {
      return {
        user: { id: "owner-id-777", email: "wode0708@gmail.com" },
        error: null,
      };
    }
  }

  const client = options.supabaseClient || getSupabaseClient();
  let data;
  let error;
  try {
    const res = await client.auth.getUser(token);
    data = res?.data;
    error = res?.error;
  } catch (err) {
    return { user: null, error: err };
  }

  if (error || !data?.user) {
    return { user: null, error: error || new Error("User not found") };
  }
  return { user: data.user, error: null };
}

export function isRateLimitExempt(user) {
  if (!user || !user.email) return false;
  return user.email.trim().toLowerCase() === "wode0708@gmail.com";
}

export function getClientIp(req) {
  const vercelForwarded = req.headers?.["x-vercel-forwarded-for"];
  if (vercelForwarded) {
    const candidate =
      typeof vercelForwarded === "string"
        ? vercelForwarded.split(",")[0].trim()
        : vercelForwarded[0]?.trim();
    if (candidate && net.isIP(candidate)) return candidate;
  }
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const candidate =
      typeof forwarded === "string"
        ? forwarded.split(",")[0].trim()
        : forwarded[0]?.trim();
    if (candidate && net.isIP(candidate)) return candidate;
  }
  const realIp = req.headers?.["x-real-ip"];
  if (realIp && typeof realIp === "string" && net.isIP(realIp.trim())) {
    return realIp.trim();
  }
  const remote =
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "";
  if (remote && net.isIP(remote)) return remote;
  return "127.0.0.1";
}

export function hashIp(ip) {
  const salt = process.env.RATE_LIMIT_SALT || "mise-ip-salt-rate-limit";
  return crypto.createHmac("sha256", salt).update(String(ip || "")).digest("hex").slice(0, 32);
}

const requestLogs = new Map();

export function checkRateLimit(key, limit, windowMs = 3600000, now = Date.now()) {
  const cutoff = now - windowMs;
  let timestamps = requestLogs.get(key) || [];

  // Filter out expired timestamps
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    requestLogs.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  timestamps.push(now);
  requestLogs.set(key, timestamps);

  // Periodic pruning if map exceeds 5000 keys
  if (requestLogs.size > 5000) {
    for (const [k, v] of requestLogs.entries()) {
      const active = v.filter((t) => t > cutoff);
      if (active.length === 0) {
        requestLogs.delete(k);
      } else {
        requestLogs.set(k, active);
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - timestamps.length),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitsForTesting() {
  requestLogs.clear();
}

export async function consumeDurableQuota(key, limit, windowSeconds = 3600, options = {}) {
  const client = options.serviceClient || getServiceRoleSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.schema("private").rpc("consume_ai_quota", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.warn("[RateLimit] consume_ai_quota RPC error:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("[RateLimit] durable quota check exception:", err.message);
    return null;
  }
}

export async function requireAiAuth(req, res, options = {}) {
  const {
    action = "ai",
    quota = 30,
    dualIpThrottle = false,
    windowMs = 3600000,
    preauthLimit = 60,
    preauthWindowMs = 600000,
    verifyTokenFn = verifySupabaseToken,
    serviceClient = null,
  } = options;

  const clientIp = getClientIp(req);
  const hashedIp = hashIp(clientIp);

  // 1. Pre-auth IP throttle: prevents high-volume token attacks against auth backend
  const preauthRate = checkRateLimit(`ip:${hashedIp}:preauth`, preauthLimit, preauthWindowMs);
  if (!preauthRate.allowed) {
    res.setHeader("Retry-After", String(preauthRate.retryAfterSeconds));
    res.status(429).json({
      error: "Too many authentication attempts. Please slow down.",
      code: "PREAUTH_RATE_LIMIT_EXCEEDED",
    });
    return null;
  }

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: "Authentication required. Please sign in to use MISE AI.",
      code: "AUTH_REQUIRED",
    });
    return null;
  }

  // Structural JWT format check
  const enforceJwt = options.enforceJwtStructure ?? (process.env.NODE_ENV !== "test");
  if (enforceJwt && !isJwtStructurallyValid(token, false)) {
    res.status(401).json({
      error: "Invalid or malformed authentication token. Please sign in again.",
      code: "INVALID_TOKEN",
    });
    return null;
  }

  const { user, error } = await verifyTokenFn(token);
  if (error || !user) {
    res.status(401).json({
      error: "Invalid or expired authentication session. Please sign in again.",
      code: "INVALID_TOKEN",
    });
    return null;
  }

  // Exempt account wode0708@gmail.com
  if (isRateLimitExempt(user)) {
    res.setHeader("X-RateLimit-Limit", "unlimited");
    res.setHeader("X-RateLimit-Remaining", "unlimited");
    return user;
  }

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  // 2. Check user rate limit (in-memory fast layer)
  const userRate = checkRateLimit(`user:${user.id}:${action}`, quota, windowMs);
  if (!userRate.allowed) {
    res.setHeader("Retry-After", String(userRate.retryAfterSeconds));
    res.setHeader("X-RateLimit-Limit", String(quota));
    res.setHeader("X-RateLimit-Remaining", "0");
    const minutes = Math.ceil(userRate.retryAfterSeconds / 60);
    res.status(429).json({
      error: `Hourly limit reached (${quota} requests/hour for this feature). Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      retryAfterSeconds: userRate.retryAfterSeconds,
      code: "RATE_LIMIT_EXCEEDED",
    });
    return null;
  }

  // 3. Check durable rate limit for user (if service role client available)
  const durableUser = await consumeDurableQuota(`user:${user.id}:${action}`, quota, windowSeconds, { serviceClient });
  if (durableUser && !durableUser.allowed) {
    const retrySec = durableUser.retry_after_seconds || userRate.retryAfterSeconds;
    const minutes = Math.ceil(retrySec / 60);
    res.setHeader("Retry-After", String(retrySec));
    res.setHeader("X-RateLimit-Limit", String(quota));
    res.setHeader("X-RateLimit-Remaining", "0");
    res.status(429).json({
      error: `Hourly limit reached (${quota} requests/hour for this feature). Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      retryAfterSeconds: retrySec,
      code: "RATE_LIMIT_EXCEEDED",
    });
    return null;
  }

  // 4. Dual IP throttling if enabled (e.g. image generation)
  if (dualIpThrottle) {
    const ipRate = checkRateLimit(`ip:${hashedIp}:${action}`, quota, windowMs);
    if (!ipRate.allowed) {
      res.setHeader("Retry-After", String(ipRate.retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(quota));
      res.setHeader("X-RateLimit-Remaining", "0");
      const minutes = Math.ceil(ipRate.retryAfterSeconds / 60);
      res.status(429).json({
        error: `Hourly limit reached for your network (${quota} requests/hour). Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        retryAfterSeconds: ipRate.retryAfterSeconds,
        code: "RATE_LIMIT_EXCEEDED",
      });
      return null;
    }

    const durableIp = await consumeDurableQuota(`ip:${hashedIp}:${action}`, quota, windowSeconds, { serviceClient });
    if (durableIp && !durableIp.allowed) {
      const retrySec = durableIp.retry_after_seconds || ipRate.retryAfterSeconds;
      const minutes = Math.ceil(retrySec / 60);
      res.setHeader("Retry-After", String(retrySec));
      res.setHeader("X-RateLimit-Limit", String(quota));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.status(429).json({
        error: `Hourly limit reached for your network (${quota} requests/hour). Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        retryAfterSeconds: retrySec,
        code: "RATE_LIMIT_EXCEEDED",
      });
      return null;
    }

    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.min(userRate.remaining, ipRate.remaining)),
    );
  } else {
    res.setHeader("X-RateLimit-Remaining", String(userRate.remaining));
  }

  res.setHeader("X-RateLimit-Limit", String(quota));
  return user;
}
