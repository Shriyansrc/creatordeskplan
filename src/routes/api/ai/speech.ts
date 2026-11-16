import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { generateSpeech } from "@lovable.dev/ai-gateway";

const inputSchema = z.object({ text: z.string().trim().min(2).max(1600), style: z.string().max(200).optional() });

export const Route = createFileRoute("/api/ai/speech")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env["LOVABLE_API_KEY"]) return Response.json({ error: "AI is not connected" }, { status: 503 });
        let input: z.infer<typeof inputSchema>;
        try {
          input = inputSchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Send the text to read aloud (2 to 1600 characters)." }, { status: 400 });
        }
        try {
          const prompt = input.style ? `Say this ${input.style}: ${input.text}` : input.text;
          const audio = await generateSpeech({ model: "google/gemini-2.5-flash-tts", contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } } } as never);
          return audio.toResponse();
        } catch (error) {
          return Response.json({ error: (error instanceof Error ? error.message : "Speech failed") + " " + JSON.stringify((error as { details?: unknown }).details ?? (error as { body?: unknown }).body ?? "").slice(0, 400) }, { status: 502 });
        }
      },
    },
  },
});
