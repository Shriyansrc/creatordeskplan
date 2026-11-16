import { createFileRoute } from "@tanstack/react-router";
import { captionsInputSchema, captionsSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/captions")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "captions", captionsInputSchema, captionsSchema, settingsFromEnv(process.env)) } },
});
