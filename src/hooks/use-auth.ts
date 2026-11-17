import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

/** Current signed-in user (null when signed out). Sign-in is optional in Creator Desk. */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    // Read the stored session locally. getUser() made a network call on every page that used this hook.
    supabase.auth.getSession().then(({ data: d }) => {
      setUser(d.session?.user ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, ready };
}

export async function signInWithGoogle(): Promise<string | null> {
  const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
  if (result.error) return result.error.message ?? "Google sign-in did not finish. Try again.";
  return null;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function displayName(user: User): string {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  return (typeof m?.["full_name"] === "string" && m["full_name"]) || user.email || "Signed in";
}

/** Short label for the header pill: first name, or the part of the email before @. */
export function shortName(user: User): string {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const full = typeof m?.["full_name"] === "string" ? m["full_name"] : "";
  const base = full.split(" ")[0] || (user.email ?? "Account").split("@")[0] || "Account";
  return base.length > 14 ? base.slice(0, 13) + "…" : base;
}
