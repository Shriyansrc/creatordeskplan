import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export type AIConnection =
  | { state: "checking" }
  | { state: "connected" }
  | { state: "not-connected"; reason: string };

export function useAIConnection(): AIConnection {
  const [status, setStatus] = useState<AIConnection>({ state: "checking" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/status", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { connected?: boolean; reason?: string };
        setStatus(body.connected ? { state: "connected" } : { state: "not-connected", reason: body.reason || "AI provider not configured" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus({ state: "not-connected", reason: "AI status could not be reached" });
      });
    return () => controller.abort();
  }, []);
  return status;
}

export async function callAI<I, O>(path: string, input: I): Promise<O> {
  const response = await fetch(`/api/ai/${path}`, {
    method: "POST",
    headers: await generationHeaders(),
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { connected?: boolean; reason?: string; error?: string; data?: O };
  if (response.status === 503 || body.connected === false) throw new Error(body.error || body.reason || "AI provider not configured");
  if (!response.ok || body.error) throw new Error(body.error || `AI request failed with HTTP ${response.status}`);
  if (body.data === undefined) throw new Error("AI route returned no data");
  return body.data;
}

export const NOT_CONNECTED_COPY = "Not connected — built-in AI is unavailable right now.";

export type ServiceStatus = { state: "checking" } | { state: "ready"; ai: boolean; references: boolean; voice: boolean; video: boolean };

export function useServiceStatus(): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>({ state: "checking" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/status", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { connected?: boolean; services?: { references?: boolean; voice?: boolean; video?: boolean } };
        setStatus({ state: "ready", ai: Boolean(body.connected), references: Boolean(body.services?.references), voice: Boolean(body.services?.voice), video: Boolean(body.services?.video) });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus({ state: "ready", ai: false, references: false, voice: false, video: false });
      });
    return () => controller.abort();
  }, []);
  return status;
}

export async function generationHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Sign in from Settings to use AI generation. Local editing still works without an account.");
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}
