import { createFileRoute } from "@tanstack/react-router";
import { planInputSchema, planSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

const mixedPlanSchema = planSchema.superRefine((plan, ctx) => {
  if (plan.topics.some((t) => !t.format || !t.pillar)) ctx.addIssue({ code: "custom", message: "Every new plan topic needs its post format and content purpose" });
  if (plan.topics.some((t) => t.platform === "yt" && t.format !== "video")) ctx.addIssue({ code: "custom", message: "YouTube entries must use video" });
  if (new Set(plan.topics.map((t) => t.pillar)).size < 2) ctx.addIssue({ code: "custom", message: "Vary content purpose, including proof or promotion where appropriate" });
  if (plan.topics.some((t) => t.platform !== "yt") && new Set(plan.topics.map((t) => t.format)).size < 2) ctx.addIssue({ code: "custom", message: "Use mixed post formats for this multi-format calendar" });
});
export const Route = createFileRoute("/api/ai/plan")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "plan", planInputSchema, mixedPlanSchema, settingsFromEnv(process.env)) } },
});
