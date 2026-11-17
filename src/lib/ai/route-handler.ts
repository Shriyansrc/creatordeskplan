import { guardGeneration } from "@/lib/references/quota.server";
import type { ZodType } from "zod";
import { generateValidated, providerIsConfigured, type ProviderSettings } from "./provider";
import type { AITask } from "./contracts";

export async function handleAIRequest<I, O>(
  request: Request,
  task: AITask,
  inputSchema: ZodType<I>,
  outputSchema: ZodType<O>,
  settings: ProviderSettings,
): Promise<Response> {
  if (!providerIsConfigured(settings)) {
    return Response.json({ connected: false, reason: "AI provider not configured" }, { status: 503 });
  }
  if (!/^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "")) return Response.json({ error: "Sign in to use AI generation." }, { status: 401 });
  try {
    const body: unknown = await request.json();
    const input = inputSchema.parse(body);
    const denied = await guardGeneration(request);
    if (denied) return denied;
    const data = await generateValidated(settings, task, input, outputSchema);
    return Response.json({ connected: true, data });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ connected: true, error: "Invalid JSON request" }, { status: 400 });
    if (error instanceof Error && error.name === "ZodError") {
      return Response.json({ connected: true, error: "AI response or request did not match the required schema" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "AI provider request failed";
    return Response.json({ connected: true, error: message.slice(0, 300) }, { status: 502 });
  }
}

export function settingsFromEnv(env: NodeJS.ProcessEnv): ProviderSettings {
  return { provider: env["AI_PROVIDER"], apiKey: env["AI_API_KEY"], model: env["AI_MODEL"] };
}
