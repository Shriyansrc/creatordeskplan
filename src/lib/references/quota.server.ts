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