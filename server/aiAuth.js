import { createClient } from "@supabase/supabase-js";

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

export function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
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
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const first =
      typeof forwarded === "string" ? forwarded.split(",")[0] : forwarded[0];
    if (first) return first.trim();
  }
  return (
    req.headers?.["x-real-ip"] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "127.0.0.1"
  );
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

export async function requireAiAuth(req, res, options = {}) {
  const {
    action = "ai",
    quota = 30,
    dualIpThrottle = false,
    windowMs = 3600000,
    verifyTokenFn = verifySupabaseToken,
  } = options;

  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: "Authentication required. Please sign in to use MISE AI.",
      code: "AUTH_REQUIRED",
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

  // 1. Check user rate limit
  const userRate = checkRateLimit(`${action}:user:${user.id}`, quota, windowMs);
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

  // 2. Dual IP throttling if enabled (e.g. image generation)
  if (dualIpThrottle) {
    const clientIp = getClientIp(req);
    const ipRate = checkRateLimit(`${action}:ip:${clientIp}`, quota, windowMs);
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
