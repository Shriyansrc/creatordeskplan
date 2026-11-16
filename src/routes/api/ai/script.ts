import { createFileRoute } from "@tanstack/react-router";
import { scriptInputSchema, scriptSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/script")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "script", scriptInputSchema, scriptSchema, settingsFromEnv(process.env)) } },
});
