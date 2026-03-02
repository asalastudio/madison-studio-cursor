/**
 * Shared CORS utilities for all edge functions.
 *
 * Usage:
 *   import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
 *
 *   serve(async (req) => {
 *     const optionsResponse = handleCorsOptions(req);
 *     if (optionsResponse) return optionsResponse;
 *     const corsHeaders = getCorsHeaders(req);
 *     // ... use corsHeaders in responses
 *   });
 */

const ALLOWED_ORIGINS = [
  "https://app.madisonstudio.io",
  "https://app.madisonstudio.ai",
  "https://madisonstudio.ai",
  "https://www.madisonstudio.ai",
  // Local development — only when ENVIRONMENT is set to development
  ...(Deno.env.get("ENVIRONMENT") === "development"
    ? [
        "http://localhost:8080",
        "http://localhost:5173",
        "http://localhost:3000",
      ]
    : []),
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

export function handleCorsOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}
