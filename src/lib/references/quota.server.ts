import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type VerifiedSession = { userId: string; status?: never } | { status: 401 | 503; userId?: never };

/** Validate against the existing backend, never decode or trust caller identity. */
export async function authenticateReference(token: string): Promise<VerifiedSession> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) return { status: 503 };
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("authorization") === `Bearer ${key}`) headers.delete("authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error) return { status: !error.status || error.status >= 500 ? 503 : 401 };
    return data.user?.id ? { userId: data.user.id } : { status: 401 };
  } catch {
    return { status: 503 };
  }
}

/** This is called only after auth.getUser has established the server identity. */
export async function reserveReferenceSearch(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("reserve_reference_search", { p_user_id: userId });
  if (error || typeof data !== "boolean") throw new Error("Reference quota unavailable");
  return data;
}
/** Shared generation guard. All paid AI requests share the existing durable 8/80 rolling-hour budget. */
export async function guardGeneration(request: Request): Promise<Response | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return Response.json({ error: "Sign in to use AI generation." }, { status: 401 });
  let session: VerifiedSession;
  try { session = await authenticateReference(token); }
  catch { return Response.json({ error: "AI authentication is unavailable. Nothing was generated." }, { status: 503 }); }
  if (session.status) return Response.json({ error: session.status === 401 ? "Sign in to use AI generation." : "AI authentication is unavailable. Nothing was generated." }, { status: session.status });
  try {
    if (!await reserveReferenceSearch(session.userId)) return Response.json({ error: "AI limit reached: 8 requests per account and 80 total per rolling hour, shared with reference searches. Try again later." }, { status: 429 });
  } catch { return Response.json({ error: "AI quota is unavailable. Nothing was generated." }, { status: 503 }); }
  return null;
            }
