import { createFileRoute } from "@tanstack/react-router";
import { referenceInputSchema, referenceSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/reference")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "reference", referenceInputSchema, referenceSchema, settingsFromEnv(process.env)) } },
});
