import { createFileRoute } from "@tanstack/react-router";
import { planInputSchema, planSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/plan")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "plan", planInputSchema, planSchema, settingsFromEnv(process.env)) } },
});
