import { createFileRoute } from "@tanstack/react-router";
import { nichesInputSchema, nichesSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/niches")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        handleAIRequest(
          request,
          "niches",
          nichesInputSchema,
          nichesSchema,
          settingsFromEnv(process.env),
        ),
    },
  },
});
