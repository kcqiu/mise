import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res, options = {}) {
  // Only allow GET and HEAD requests (Vercel crons send GET)
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use GET or HEAD.",
    });
  }

  // If CRON_SECRET is configured in Vercel environment, verify the bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }
  }

  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const supabaseKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      ok: false,
      error: "Supabase configuration missing.",
    });
  }

  try {
    const client =
      options.client ||
      createClient(supabaseUrl.trim(), supabaseKey.trim(), {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

    // Query 1 system recipe to register external database activity on public.recipes
    const { data, error } = await client
      .from("recipes")
      .select("id")
      .eq("is_system", true)
      .limit(1);

    if (error) {
      console.error("[Cron Keepalive Error] Database query failed:", error.message);
      return res.status(500).json({
        ok: false,
        error: "Database query failed",
        details: error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      matchedRecords: Array.isArray(data) ? data.length : 0,
    });
  } catch (err) {
    console.error("[Cron Keepalive Error] Unexpected exception:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error during keepalive ping",
    });
  }
}
