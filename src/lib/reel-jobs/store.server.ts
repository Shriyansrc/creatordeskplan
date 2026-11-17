import { createClient } from "@supabase/supabase-js";
import type { Auth, JobRow, ReelJobStore } from "./api.server";

/** Verifies the token against the backend, then returns a store bound to that user's own token (policies apply). */
export async function authenticateReelUser(token: string): Promise<Auth> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) return { status: 503 };
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
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
    if (!data.user?.id) return { status: 401 };
    const t = (client as any).from("reel_jobs"); // table is not in generated types until it is applied
    const cols = "id,user_id,status,brief_json,source_video_path,result_video_path,error,created_at";
    const store: ReelJobStore = {
      insert: async (userId, id, brief, sourcePath) => { const r = await (client as any).from("reel_jobs").insert({ id, user_id: userId, brief_json: brief, source_video_path: sourcePath }).select(cols).single(); return { row: r.data as JobRow, error: r.error }; },
      list: async () => { const r = await t.select(cols).order("created_at", { ascending: false }).limit(100); return { rows: r.data as JobRow[], error: r.error }; },
      get: async (id) => { const r = await (client as any).from("reel_jobs").select(cols).eq("id", id).maybeSingle(); return { row: r.data as JobRow | null, error: r.error }; },
      cancel: async (id) => { const r = await (client as any).from("reel_jobs").update({ status: "canceled" }).eq("id", id).eq("status", "submitted").select(cols).maybeSingle(); return { row: r.data as JobRow | null, error: r.error }; },
      upload: async (path, file) => { const r = await client.storage.from("reel-sources").upload(path, file, { upsert: false, contentType: file.type || "video/mp4" }); return { error: r.error as any }; },
      signedUrl: async (path, s) => { const r = await client.storage.from("reel-results").createSignedUrl(path, s); return { url: r.data?.signedUrl ?? undefined, error: r.error as any }; },
    };
    return { userId: data.user.id, store };
  } catch { return { status: 503 }; }
}
