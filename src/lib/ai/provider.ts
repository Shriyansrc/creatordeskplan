import { z, type ZodType } from "zod";
import type { AITask } from "./contracts";
import { generateChatCompletion } from "@lovable.dev/ai-gateway";

export type ProviderSettings = {
  provider: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
};
type ConfiguredProviderSettings = { provider: string; apiKey: string; model: string };

const TASK_RULES: Record<AITask, string> = {
  research: "You are given liveSources: real search suggestions and public posts fetched just now, each with a numeric id. Build the research ONLY from them. Return nicheSummary (what the sources show, plain words), audience (profile, age, location, platforms, activeTimes, painPoints[{title,detail,sourceIds}], searches[{phrase,intent,platform,sourceIds}]), keywords[{keyword,trend,reason,sourceIds}], and referenceIdeas[{title,platform,format,why,searchQuery,scriptAngle}]. sourceIds list the ids of liveSources that support the item and must exist. searches phrases should be taken from the suggestion sources. Pain points must come from what people ask or complain about in the discussion sources; if the sources support fewer, return fewer (at least 1). Use age, location and activeTimes only if a source says so, otherwise write 'not shown in sources'. trend is a short plain note of what the sources show, never an invented number. Platforms use only ig, yt, li, x. Do not invent view counts, URLs or sources.",
  plan: "Return exactly 30 topics and exactly 30 calendar entries covering days 1 through 30. Each topic has id,title,day,rank,score,reason,painPoint,kind (trending|pain point|authority),platform. Each calendar item has day,topicId. Rank by estimated potential from the supplied niche and research, state a concrete reason, mix trends, pain points and authority. Never claim live analytics. Platform values only ig, yt, li, x. Use stable ids topic-1 through topic-30 and unique days.",
  script: "You write short-form video scripts that sound like a real person talking, not like AI. Return hook,problem,solution,cta,title,caption,hashtags,seoPhrase,options. LANGUAGE: if language is supplied, write EVERYTHING spoken or shown (hook, problem, solution, cta, title, caption and every option) in it. Hinglish means Hindi written in Roman letters, mixed with English the way young Indians actually talk (for example 'Board exam mein sabse badi galti ye hoti hai'), never plain English. Hindi means Devanagari. Any other language: that language's normal script. Never answer in English when another language is set. VOICE: plain spoken words, short sentences, one idea per line, contractions, the audience's own phrases from painPoint and searchPhrases. Open already inside the pain or a surprising true claim in the first line (no 'hi guys', no intro, no 'in today's world', no 'did you know', no 'imagine', no question stacks). Ban these AI tells: unlock, game-changer, delve, journey, elevate, secret, ultimate, revolutionary, 'here is the thing', 'let's dive in', 'but here is the catch'. Do not invent stories, personal backstory, statistics, results or testimonials. Only claim what is plainly true or already in the inputs. STRUCTURE: hook (one strong line that works spoken and as on-screen text), problem (make the viewer feel understood, pick ONE specific pain, give a small peak line each beat), solution (clear, actionable steps or one worked example; when explaining a concept use ONE everyday analogy and stay in it), cta (exactly ONE easy next action matched to the goal, such as a comment word or a save, never several). Alternate peaks and short releases so there is no slow warm-up and no long middle. SEO: seoPhrase MUST be one of searchPhrases (real search suggestions fetched live) or a close variant that keeps the same words; if searchPhrases is empty use the most natural search query for the topic in the video language. Say the seoPhrase naturally in the first line of the hook or problem and again once later, and use it in the title. title is a search-friendly title under 70 characters that leads with the seoPhrase and states a clear benefit, no clickbait or fake numbers. caption is 2 to 4 short lines that repeat the seoPhrase and 1 to 2 related keywords from researchKeywords, ending with the cta. hashtags: 5 to 8, built from researchKeywords and searchPhrases (words joined without spaces), one broad and the rest specific, no generic filler like #viral #fyp. Never promise rankings, views or search volume. If styleNotes is supplied you MUST follow that creator style strictly: casing, openers, sentence length and vocabulary. options contains hook, problem, solution and cta, each with genuinely different a and b alternatives in the same language. If instruction and current are supplied, rewrite current exactly as instructed, keeping the language, seoPhrase and structure unless told otherwise; otherwise write a fresh script.",
  platforms: "Return recommendations[{platform,reason}] using only ig, yt, li and x. Recommend only platforms that fit the stated goals and topic. Each reason is one concise sentence.",
  edit: "Return summary and operations. Use only these operation types: trim, split, delete, reorder, speed, volume, crop, color, removeSilence, captions, textOverlay, zoom. Use only clip ids from the supplied timeline. Ratios only 9:16, 1:1, 4:5, 16:9. Color values are percentages with 100 unchanged; volume is 0 to 1; speed is 0.25 to 4. Do not output code, URLs, file paths, or unknown operations. Make the smallest operation list that performs the prompt. Every operation needs its exact fields and omit optional fields instead of using null. Example: {\"summary\":\"Brightens the clip and turns captions on\",\"operations\":[{\"type\":\"color\",\"clipId\":\"<id from timeline>\",\"brightness\":120},{\"type\":\"captions\",\"enabled\":true,\"style\":\"owner\"}]}.",
  niches: "Return niches[{title,fit}] with 3 to 6 specific content niches for the supplied topic, audience and goal. Each fit is one concise sentence explaining why it suits them.",
  goal: "From the creator's answers return goals[{goal,why}] with 2 or 3 distinct video goals (for example grow a business, build a personal brand, teach, sell). Each why is one concise sentence tied to their answers. Do not assume anything they did not say.",
  topics: "From the creator's answers return topics[{title,why}] with 3 to 6 specific video topics they could make content about. Each title is plain words a person would say, under 12 words. Each why is one concise sentence tied to their answers. Do not invent facts about them.",
  audience: "For the supplied topic and goal return audiences[{name,why,painPoints[{title,detail}]}] with 3 to 5 distinct viewer groups who would watch this content. Each has 2 to 5 pain points phrased as the viewer's real problem. These are AI estimates, not research results: never cite sources, statistics, or numbers.",
  reference: "The creator pasted the caption, transcript or description of a reference post they admire. Analyse ONLY the pasted text and numbers. Return summary, hookPattern (the pattern of the opening line), structure[{beat,detail}] in order, whyItWorks[], adaptForMe[] (concrete ways to apply the pattern to the creator's own topic without copying wording), avoid[]. Never claim you watched the video or opened the link. Do not invent numbers.",
  style: "From the creator's own writing samples return name (2 to 4 words), tone, sentenceRules[] (observable rules such as sentence length, openers, person), vocabulary[] (words or phrases they actually use), avoid[] (things their writing never does), sampleLine (one new line in their voice). Base everything on the samples only.",
  captions: "Return captions[{platform,text}], one for every requested platform. Platform values only ig, yt, li, x. Adapt length and tone per platform from the supplied script; do not add claims or hashtags not supported by it.",
};

function ownKeyConfigured(settings: ProviderSettings) {
  return Boolean(settings.provider?.trim() && settings.apiKey?.trim() && settings.model?.trim());
}

/** Built-in Lovable AI is used whenever no own provider key is set. */
function builtInAvailable() {
  return Boolean(process.env["LOVABLE_API_KEY"]);
}

export function providerIsConfigured(settings: ProviderSettings) {
  return ownKeyConfigured(settings) || builtInAvailable();
}

async function callBuiltIn(system: string, prompt: string): Promise<string> {
  const result = await generateChatCompletion({
    model: "openai/gpt-6.1-terra",
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
  });
  const content = result.choices[0]?.message.content;
  return typeof content === "string" ? content : "";
}

function endpointFor(provider: string, model: string) {
  const name = provider.trim();
  if (/^https?:\/\//.test(name)) return { kind: "openai", url: name };
  switch (name.toLowerCase()) {
    case "openai":
      return { kind: "openai", url: "https://api.openai.com/v1/chat/completions" };
    case "openrouter":
      return { kind: "openai", url: "https://openrouter.ai/api/v1/chat/completions" };
    case "anthropic":
      return { kind: "anthropic", url: "https://api.anthropic.com/v1/messages" };
    case "google":
    case "gemini":
      return { kind: "gemini", url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` };
    default:
      throw new Error("AI_PROVIDER must be openai, openrouter, anthropic, gemini, or an OpenAI-compatible endpoint URL");
  }
}

async function callProvider(settings: ConfiguredProviderSettings, system: string, prompt: string): Promise<string> {
  const endpoint = endpointFor(settings.provider, settings.model);
  const common = { signal: AbortSignal.timeout(60_000) };
  let response: Response;
  if (endpoint.kind === "anthropic") {
    response = await fetch(endpoint.url, {
      ...common,
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: settings.model, max_tokens: 8192, temperature: 0.4, system, messages: [{ role: "user", content: prompt }] }),
    });
  } else if (endpoint.kind === "gemini") {
    response = await fetch(endpoint.url, {
      ...common,
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": settings.apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 8192 } }),
    });
  } else {
    response = await fetch(endpoint.url, {
      ...common,
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ model: settings.model, temperature: 0.4, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
  }
  if (!response.ok) throw new Error(`AI provider request failed with HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (endpoint.kind === "anthropic") {
    const parsed = z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).parse(payload);
    return parsed.content.find((part) => part.type === "text")?.text ?? "";
  }
  if (endpoint.kind === "gemini") {
    const parsed = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) })) }).parse(payload);
    return parsed.candidates[0]?.content.parts.map((part) => part.text ?? "").join("") ?? "";
  }
  const parsed = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })) }).parse(payload);
  return parsed.choices[0]?.message.content ?? "";
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function stripEmDashes(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\s*\u2014\s*/g, (m) => (/\s/.test(m) ? " - " : ", "));
  if (Array.isArray(value)) return value.map(stripEmDashes);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, stripEmDashes(v)]));
  return value;
}

export async function generateValidated<T>(settings: ProviderSettings, task: AITask, input: unknown, schema: ZodType<T>): Promise<T> {
  if (!providerIsConfigured(settings)) throw new Error("AI provider not configured");
  const system = `You are Creator Desk's ${task} engine. Return one valid JSON object only, with no markdown or commentary. Never use em dashes; use a comma, full stop or hyphen instead. ${TASK_RULES[task]}`;
  const text = ownKeyConfigured(settings)
    ? await callProvider(settings as ConfiguredProviderSettings, system, JSON.stringify(input))
    : await callBuiltIn(system, JSON.stringify(input));
  return schema.parse(stripEmDashes(parseJson(text)));
}
