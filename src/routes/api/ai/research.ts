import { createFileRoute } from "@tanstack/react-router";
import { researchInputSchema, researchSchema } from "@/lib/ai/contracts";
import { generateValidated, providerIsConfigured } from "@/lib/ai/provider";
import { settingsFromEnv } from "@/lib/ai/route-handler";
import { gatherSources } from "@/lib/ai/sources";

export const RESEARCH_NO_SOURCE = "Live research could not reach enough sources right now. Nothing was estimated. Try again in a minute.";
const MIN_SOURCES = 4;

export const Route = createFileRoute("/api/ai/research")({
  server: {
    handlers: {
      // Sources only, no AI call: lets the live lookup be checked on its own.
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const topic = (u.searchParams.get("topic") ?? "").slice(0, 100);
        const niche = (u.searchParams.get("niche") ?? topic).slice(0, 100);
        if (topic.trim().length < 2) return Response.json({ error: "topic is required" }, { status: 400 });
        const report = await gatherSources(topic, niche);
        return Response.json({ count: report.sources.length, checked: report.checked, sources: report.sources });
      },
      POST: async ({ request }) => {
        const settings = settingsFromEnv(process.env);
        if (!providerIsConfigured(settings)) return Response.json({ connected: false, reason: "AI provider not configured" }, { status: 503 });
        let input;
        try { input = researchInputSchema.parse(await request.json()); }
        catch { return Response.json({ connected: true, error: "Invalid research request" }, { status: 400 }); }
        try {
          const report = await gatherSources(input.topic, input.niche);
          if (report.sources.length < MIN_SOURCES) return Response.json({ connected: true, error: RESEARCH_NO_SOURCE }, { status: 502 });
          const grounded = { ...input, liveSources: report.sources.map((s) => ({ id: s.id, site: s.site, title: s.title, snippet: s.snippet })) };
          const data = await generateValidated(settings, "research", grounded, researchSchema);
          const valid = new Set(report.sources.map((s) => s.id));
          const keep = (ids?: number[]) => (ids ?? []).filter((x) => valid.has(x));
          const out = {
            ...data,
            audience: {
              ...data.audience,
              painPoints: data.audience.painPoints.map((x) => ({ ...x, sourceIds: keep(x.sourceIds) })),
              searches: data.audience.searches.map((x) => ({ ...x, sourceIds: keep(x.sourceIds) })),
            },
            keywords: data.keywords.map((x) => ({ ...x, sourceIds: keep(x.sourceIds) })),
            sources: report.sources,
            checkedAt: new Date().toISOString(),
          };
          return Response.json({ connected: true, data: out });
        } catch (error) {
          const message = error instanceof Error && error.name !== "ZodError" ? error.message : "Response did not match the required schema";
          return Response.json({ connected: true, error: message.slice(0, 300) }, { status: 502 });
        }
      },
    },
  },
});
