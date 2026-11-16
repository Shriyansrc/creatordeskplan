import { createFileRoute } from "@tanstack/react-router";
import { editInputSchema, editResponseSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/edit")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "edit", editInputSchema, editResponseSchema, settingsFromEnv(process.env)) } },
});
