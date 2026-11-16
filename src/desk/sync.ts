import { supabase } from "@/integrations/supabase/client";
import { getDesk, patchDesk, type DeskState } from "@/desk/store";

/** Account sync: one private row per signed-in user in creator_state (row security, own row only). Text plans only, never clips or tokens. */
const SYNCED_KEY = "cd:syncedAt";
const MAX_BYTES = 400_000;

export type Bundle = { v: 1; desk: DeskState; style: unknown };
export type Remote = { state: Bundle; updated_at: string } | null;

// The generated types file predates the creator_state table, so the table name is cast once here.
const table = () => (supabase as unknown as { from: (t: string) => any }).from("creator_state");

export function localBundle(): Bundle {
  let style: unknown = null;
  try {
    const raw = window.localStorage.getItem("cd:style");
    if (raw) style = JSON.parse(raw);
  } catch {
    style = null;
  }
  return { v: 1, desk: getDesk(), style };
}

export function lastSyncedAt(): string | null {
  try {
    return window.localStorage.getItem(SYNCED_KEY);
  } catch {
    return null;
  }
}

export async function fetchRemote(userId: string): Promise<{ remote: Remote; error: string | null }> {
  const { data, error } = await table().select("state, updated_at").eq("user_id", userId).maybeSingle();
  if (error) return { remote: null, error: error.message };
  return { remote: data ? { state: data.state as Bundle, updated_at: data.updated_at as string } : null, error: null };
}

export async function pushLocal(userId: string): Promise<string | null> {
  const bundle = localBundle();
  const json = JSON.stringify(bundle);
  if (json.length > MAX_BYTES) return "Your plans are too large to sync. Export your data from Settings instead.";
  const at = new Date().toISOString();
  const { error } = await table().upsert({ user_id: userId, state: bundle, updated_at: at }, { onConflict: "user_id" });
  if (error) return error.message;
  window.localStorage.setItem(SYNCED_KEY, at);
  return null;
}

export function applyRemote(r: NonNullable<Remote>): string | null {
  const b = r.state;
  if (!b || b.v !== 1 || !b.desk || typeof b.desk !== "object" || !b.desk.profile) return "The saved copy is in a format this version cannot read.";
  patchDesk(b.desk);
  try {
    if (b.style) window.localStorage.setItem("cd:style", JSON.stringify(b.style));
    else window.localStorage.removeItem("cd:style");
    window.localStorage.setItem(SYNCED_KEY, r.updated_at);
  } catch {
    return "Could not write to this browser.";
  }
  return null;
}
