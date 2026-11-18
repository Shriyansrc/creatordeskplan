import { z, type ZodType } from "zod";
import type { AITask } from "./contracts";
import { generateChatCompletion } from "@lovable.dev/ai-gateway";
import { cleanScript, SCRIPT_VOICE_RULES } from "./script-style";

export type ProviderSettings = {
  provider: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
};
type ConfiguredProviderSettings = { provider: string; apiKey: string; model: string };

const TASK_RULES: Record<AITask, string> = {
  research: "You are given liveSources: real search suggestions and public posts fetched just now, each with a numeric id. Build the research ONLY from them. Return nicheSummary (what the sources show, plain words), audience (profile, age, location, platforms, activeTimes, painPoints[{title,detail,sourceIds}], searches[{phrase,intent,platform,sourceIds}]), keywords[{keyword,trend,reason,sourceIds}], and referenceIdeas[{title,platform,format,why,searchQuery,scriptAngle}]. sourceIds list the ids of liveSources that support the item and must exist. searches phrases should be taken from the suggestion sources. Pain points come from what people ask or struggle with: read the question-style search suggestions ('how to', 'why', 'mistakes', 'best') and any discussion posts, and turn each real search into the problem behind it (for example 'exam preparation in hindi' shows people want it in Hindi). Also keep any input painPoints that a source or search supports, with sourceIds. Give 3 to 8 pain points, each tied to at least one sourceId. Do not add one that no source supports; return fewer or an empty list instead. Use age, location and activeTimes only if a source says so, otherwise write 'not shown in sources'. trend is a short plain note of what the sources show, never an invented number. Platforms use only ig, yt, li, x. Do not invent view counts, URLs or sources.",
  plan: "Optimize for the stated goal and specific purpose, not just the topic. Mix education, proof, promotion and connection across the month, rather than repeating why someone needs the product. For a website seller, include practical local-business help, honest process or portfolio prompts, service/offer promotion and invitations to enquire. Never invent client results or testimonials; proof entries should ask the creator to use their own real examples. Every topic MUST include format (video|image|text) and pillar (education|proof|promotion|connection). LinkedIn should prioritize text and image posts with occasional video; Instagram can mix images and video; YouTube uses video; X favors text and image with occasional video. Include a consistent varied cadence within the selected platforms. Return exactly 30 topics and exactly 30 calendar entries covering days 1 through 30. Each topic has id,title,day,rank,score,reason,painPoint,kind (trending|pain point|authority),platform. Each calendar item has day,topicId. Rank by estimated potential from the supplied niche and research, state a concrete reason, mix trends, pain points and authority. Never claim live analytics. If language is supplied, write every topic title, reason and painPoint in that language (Hinglish means Hindi in Roman letters mixed with English, how Indian creators really talk; keep the exact search phrases from research.audience.searches and research.keywords inside titles where they fit). Platform values only ig, yt, li, x. Use stable ids topic-1 through topic-30 and unique days.",
  script: "Respect format: for text, return a ready-to-edit text post split across hook,problem,solution,cta; for image, return concise image/card copy in those fields plus a caption; never instruct recording a text/image post. For video, write a spoken script. You write short-form video scripts that sound like a real person talking, not like AI. Return hook,problem,solution,cta,title,caption,hashtags,seoPhrase,options. LANGUAGE: if language is supplied, write EVERYTHING spoken or shown (hook, problem, solution, cta, title, caption and every option) in it. Hinglish means Hindi written in Roman letters, mixed with English the way young Indians actually talk (for example 'Board exam mein sabse badi galti ye hoti hai'), never plain English. Hindi means Devanagari. Any other language: that language's normal script. Never answer in English when another language is set. " + SCRIPT_VOICE_RULES + " REFERENCE: if a reference object is supplied, it describes a video the creator chose as a model. Reuse its hook pattern, beat order, pacing and visual patterns for this topic, and build on reference.idea when present. Never copy its wording, never claim the creator made, lived or experienced anything from the reference, and never mention its results or numbers. Use the audience's own phrases from painPoint and searchPhrases. Open inside a recognisable situation, concrete tension, useful contrast or surprising supported claim (no 'hi guys', no intro, no 'in today's world', no 'did you know', no 'imagine', no question stacks). Ban these AI tells: unlock, unleash, leverage, seamless, crucial, dive, navigate, landscape, transform, empower, game-changer, delve, journey, elevate, secret, ultimate, revolutionary, 'here is the thing', 'let's dive in', 'but here is the catch'. Do not invent stories, personal backstory, statistics, results or testimonials. Only claim what is plainly true or already in the inputs. COLD-VIEWER OPENING AND PAYOFF: Assume the viewer has never seen this creator, does not know the product, and did not read the profile or topic title. In the opening beat, make the situation legible: who this is for or what concrete moment/problem/result we are talking about, why it matters now, and what specific useful thing the viewer will leave able to do or understand. Weave those into natural spoken lines, not a checklist, greeting, biography or slow introduction. Start with tension, then orient fast; context is not permission to delay the hook. A vague feeling or pronoun is not enough: name what the person is trying to do and where it goes wrong, using only the supplied topic/audience. Do not assume a conversation means an interview or a new group when the topic does not establish that. If the supplied topic is broad, choose a clearly framed illustrative situation that fits, never present it as the creator's lived experience. Give a credible, specific reason to keep watching: an exact line to try, a worked distinction, a mistake they can check, a small demonstration, or another concrete payoff the body actually delivers. It need not literally say stay, watch till the end, or in this video; do not use those empty retention requests. Deliver the first useful line/example early, then explain why it works. Show the actual usable wording or action rather than only saying be confident, ask questions, use a hook, or practice more. Do not promise confidence, customers, rankings, fluency or other guaranteed results. The optional problem field must add NEW information, such as a cause, constraint or contrast, not paraphrase the opening fear in different words. If there is no new information, leave problem empty. Before returning, silently read hook+problem+solution+cta as one piece for a stranger: can they identify the situation without the title, name the promised payoff, and point to where it is delivered? Cut repeated setup, unexplained references, generic encouragement and unsupported claims. Consider several different opening angles internally and choose the one with the clearest honest payoff; do not return a brainstorming preamble. Hook alternatives must each work for a cold viewer and promise only what the unchanged body delivers. Body alternatives must still deliver the chosen opening's payoff; do not introduce disconnected examples just to make options different. A rewrite instruction is not permission to lose cold-viewer context or promise more than the body delivers. TOPIC-FIRST LENGTH AND FLOW: Choose the length and shape from the actual idea, audience and format, not from a fixed template or equal-sized sections. A single useful tip may need only a few spoken sentences; a worked explanation needs enough detail and a concrete example, still within 30 seconds; a story needs only its real supported beats. Do not force all topics to the same word count or four equal paragraphs, and never exceed 30 seconds of speech for one version. depth=brief means remove secondary ideas; depth=deep means explain the mechanism and a concrete example, not pad with extra adjectives; depth=auto means use only the space the idea earns. The hook/problem/solution/cta keys are storage slots, NOT words to say or compulsory acts. Put a natural body in solution and leave problem empty when a separate problem setup would repeat the hook or not fit (proof, offer, story, announcement). No forced problem-agitate-solution pattern for every post. Never invent a story to satisfy a shape. Keep one useful through-line, vary sentence and beat length, cut repeated setup and recap. STRUCTURE: hook (a strong opening), problem (optional context, empty string when not needed), solution (the useful body: steps, worked example, observation or supported story beats), cta (exactly ONE easy next action matched to the goal: ask a comment question, ask to save for later, follow for the next part or share with a named person. Never offer or promise a DM, PDF, planner, e-book, free resource, call or any deliverable unless the instruction explicitly supplies that offer). Keep it flowing with no slow warm-up and no long middle. SEO: seoPhrase MUST be one of searchPhrases (real search suggestions fetched live) or a close variant that keeps the same words; if searchPhrases is empty use the most natural search query for the topic in the video language. Choose the opening from the topic; do not force a fear or pain opening on every subject. Never make the opening a keyword label. Say the seoPhrase aloud ONCE, only where it fits the sentence the way a person would really say it (it may be inside a longer natural sentence), never as the first words of a line and never repeated word for word; the caption and title carry it exactly. Spoken lines must never read like a keyword list. title is a search-friendly title under 70 characters that leads with the seoPhrase and states a clear benefit, no clickbait or fake numbers. caption is 2 to 4 short lines that repeat the seoPhrase and 1 to 2 related keywords from researchKeywords, ending with the cta. hashtags: 5 to 8, built from researchKeywords and searchPhrases (words joined without spaces), one broad and the rest specific, no generic filler like #viral #fyp. Never promise rankings, views or search volume. If styleNotes is supplied you MUST follow that creator style strictly: casing, sentence length and vocabulary, while still making the opening clear to a cold viewer and grounding every claim. Treat examples as voice references, not facts or offers to copy. options contains hook, problem, solution and cta, each with genuinely different a and b alternatives in the same language. If instruction and current are supplied, rewrite current exactly as instructed, keeping the language and seoPhrase unless told otherwise; change the flow and length when the rewrite asks for it; otherwise write a fresh script.",
  platforms: "Return recommendations[{platform,reason}] using only ig, yt, li and x. Recommend only platforms that fit the stated goals and topic. Each reason is one concise sentence.",
  edit: "Return summary and operations. Use only these operation types: trim, split, delete, reorder, speed, volume, crop, color, removeSilence, captions, textOverlay, zoom. Use only clip ids from the supplied timeline. Ratios only 9:16, 1:1, 4:5, 16:9. Color values are percentages with 100 unchanged (temperature -100 to 100); volume is 0 to 1; speed is 0.25 to 4. Do not output code, URLs, file paths, or unknown operations. Every operation needs its exact fields and omit optional fields instead of using null. Example: {\"summary\":\"Brightens the clip and turns captions on\",\"operations\":[{\"type\":\"color\",\"clipId\":\"<id from timeline>\",\"brightness\":120},{\"type\":\"captions\",\"enabled\":true,\"style\":\"owner\"}]}. SCOPE: if the prompt asks for one specific change, make only that change. If it asks for a full edit, 'edit this', 'my style' or 'make it ready', apply this creator's standing talking-head rules, using only what these operations can do. (1) Cut every blank space so only dialogue remains: removeSilence on each speaking clip, keep sentence ends and never cut a key spoken phrase just to hide a head turn; use transcript word times to place trims so no word is cut mid-way. (2) The title or hook line must start within the first 2.5 seconds: if the transcript shows the hook later, trim or reorder so it opens the video. (3) Add a slow zoom-in over the first 2.5 seconds on the first clip (zoom operation, start 0 to end 2.5 in clip time, scale about 1.1 to 1.15), subtle. (4) Captions on with style owner (one word at a time, timed to the spoken words). (5) Colour: mild navy cool shadows with natural warm skin, slightly lower saturation, medium-high contrast, for example contrast 110 to 115, saturation 90 to 95, temperature at most -8 to +5; never an extreme cast. (6) Keep the voice clean and on top: leave volume at 1 unless asked. (7) Use textOverlay only for the hook as a short on-screen text hook in the first 2 seconds, in the video language, at most 6 words. Mix up nothing the user did not ask for and never regenerate or alter footage. NOT SUPPORTED in this editor and therefore never output as operations or promised: fisheye or lens effects, sound effects, background music, rounded wrapping or bubbly motion text, character or silhouette replacement, sticker cutouts, motion-graphic scenes and AI video generation. When the prompt asks for any of those or for the full style, say plainly in the summary which of them were NOT applied here and need a separate editor, in one short sentence. transcript comes from an English speech model and can be rough for Hindi or Hinglish speech, so do not trim on a word that looks like a recognition error. The summary names what each operation does in plain words.",
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

function zodSummary(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`).join("; ").slice(0, 500);
  return "unknown validation failure";
}

export async function generateValidated<T>(settings: ProviderSettings, task: AITask, input: unknown, schema: ZodType<T>): Promise<T> {
  if (!providerIsConfigured(settings)) throw new Error("AI provider not configured");
  const system = `You are Creator Desk's ${task} engine. Return one valid JSON object only, with no markdown or commentary. Never use em dashes; use a comma or full stop instead. ${TASK_RULES[task]}`;
  const call = (sys: string) => (ownKeyConfigured(settings) ? callProvider(settings as ConfiguredProviderSettings, sys, JSON.stringify(input)) : callBuiltIn(sys, JSON.stringify(input)));
  const clean = (raw: string) => (task === "script" ? cleanScript(stripEmDashes(parseJson(raw))) : stripEmDashes(parseJson(raw)));
  const first = await call(system);
  try {
    return schema.parse(clean(first));
  } catch (cause) {
    if (!(cause instanceof z.ZodError)) throw cause;
    const retry = await call(`${system} Your previous reply failed validation: ${zodSummary(cause)}. Return a corrected JSON object only, following the contract exactly.`);
    return schema.parse(clean(retry));
  }
}
