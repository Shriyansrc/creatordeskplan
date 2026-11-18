import { generateChatCompletion } from "@lovable.dev/ai-gateway";
import { classify, verify } from "@/lib/references/web";
import { authenticateReference, reserveReferenceSearch, type VerifiedSession } from "@/lib/references/quota.server";
import {
  contextSchema, MAX_UPLOAD_BYTES, observedSchema, performanceWarning, platformOfLink, unknownMetric, UPLOAD_MIME,
  type AnalysisContext, type Metrics, type NeedsUpload, type Observed, type Provenance, type ReferenceAnalysisResult,
} from "./contracts";

export const MODEL = "google/gemini-3.8-flash";
type Media = { kind: "link"; url: string } | { kind: "inline"; dataUrl: string };
export type Watched = { observed: Observed; audioTokens: number; videoTokens: number };
export type Deps = {
  authenticate: (token: string) => Promise<VerifiedSession>;
  reserve: (userId: string) => Promise<boolean>;
  watch: (media: Media, ctx: AnalysisContext) => Promise<Watched>;
  ytDetails: (url: string, id: string) => Promise<{ title: string; author: string; views: number | null } | null>;
  now?: () => Date;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Checks the first bytes so a renamed non-video file is rejected before any paid call. */
export function looksLikeVideo(bytes: Uint8Array, mime: string): boolean {
  if (mime === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
}

function prompt(ctx: AnalysisContext) {
  return `You are watching a short reference video for a creator. Report ONLY what you actually see and hear in this video. Return one JSON object, no markdown, with exactly these keys:
canSee (boolean, false if you cannot access the video frames), speechHeard (boolean, true only if you hear words spoken),
hook (what happens and is said in the first seconds), spokenPoints (main points actually spoken, paraphrased, [] if silent),
onScreenText ([{at:"m:ss", text}] for text visible on screen), structure ([{start:"m:ss", end:"m:ss", beat}] approximate),
visualPatterns (framing, cuts, captions, b-roll, graphics you observe), pacing (cut rate and speaking speed you observe),
durationSeconds (number or null), topicFit (how the video relates to the creator's topic below),
fitCaution ("" unless the video's topic or audience clearly mismatches the creator's; if so name the specific mismatch; never comment on production quality here),
ideas (3 ORIGINAL video ideas for the creator's topic that reuse the format, [{title, angle}]),
scriptDirection ({hookPattern, beats: [beat descriptions], notes} describing the pattern to reuse, not wording),
avoidCopying (things not to copy).
Never invent a transcript, views, likes, comments, dates or who the person is. Do not quote more than a short phrase. Ideas must not claim the creator lived the reference's story, and titles must not promise results or numbers like "double", "10x" or "more sales".
Creator context: topic "${ctx.topic}", niche "${ctx.niche}", goal "${ctx.goal}", audience "${ctx.audience}". Write ideas and scriptDirection in ${ctx.language || "English"}.`;
}

export function parseObserved(text: string): Observed {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json");
  return observedSchema.parse(JSON.parse(text.slice(start, end + 1)));
}

export async function watchWithGateway(media: Media, ctx: AnalysisContext): Promise<Watched> {
  const url = media.kind === "link" ? media.url : media.dataUrl;
  const res = await generateChatCompletion({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: [{ type: "video_url", video_url: { url } }, { type: "text", text: prompt(ctx) }] }],
  }, { maxRetries: 0, retryWaitBudgetMs: 0 });
  const r = res as unknown as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens_details?: { audio_tokens?: number; video_tokens?: number } } };
  const content = r.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? "").join("") : "";
  return { observed: parseObserved(text), audioTokens: r.usage?.prompt_tokens_details?.audio_tokens ?? 0, videoTokens: r.usage?.prompt_tokens_details?.video_tokens ?? 0 };
}

export async function youtubeDetails(url: string, id: string) {
  const v = await verify({ platform: "yt", url, id, title: "", snippet: "", engine: "link" });
  return v && v.verified === "platform" ? { title: v.title, author: v.author, views: v.views } : null;
}

const NAME = { ig: "Instagram", li: "LinkedIn", x: "X" } as const;

export function createAnalysisHandler(deps: Deps) {
  return async (request: Request): Promise<Response> => {
    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) return json({ error: "Sign in to analyse a reference." }, 401);
    let session: VerifiedSession;
    try { session = await deps.authenticate(token); } catch { return json({ error: "Sign-in check is unavailable. Nothing was analysed." }, 503); }
    if (session.status) return json({ error: session.status === 401 ? "Sign in to analyse a reference." : "Sign-in check is unavailable. Nothing was analysed." }, session.status);

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: "Send a link or a video file." }, 400); }
    const ctxParsed = contextSchema.safeParse(Object.fromEntries(["topic", "niche", "goal", "audience", "language"].map((k) => [k, String(form.get(k) ?? "")])));
    if (!ctxParsed.success) return json({ error: "Your topic details are too long." }, 400);
    const ctx = ctxParsed.data;
    const link = String(form.get("link") ?? "").trim();
    const file = form.get("file");
    const hasFile = typeof file === "object" && file !== null && "arrayBuffer" in file && (file as File).size > 0;
    if (!link && !hasFile) return json({ error: "Add a video link or choose a video file." }, 400);
    if (link && hasFile) return json({ error: "Use either a link or a file, not both." }, 400);

    let media: Media;
    let provenance: Provenance;
    let yt: { url: string; id: string } | null = null;
    if (hasFile) {
      const f = file as File;
      if (!(UPLOAD_MIME as readonly string[]).includes(f.type)) return json({ error: "That file type is not supported. Use an MP4, MOV or WebM video." }, 415);
      if (f.size > MAX_UPLOAD_BYTES) return json({ error: "That video is larger than 15 MB. Trim it or export a smaller copy." }, 413);
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!looksLikeVideo(bytes, f.type)) return json({ error: "That file does not look like a real video." }, 415);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      media = { kind: "inline", dataUrl: `data:${f.type};base64,${btoa(bin)}` };
      provenance = { kind: "upload", platform: "file", url: null, fileName: f.name.slice(0, 120), title: null, creator: null };
    } else {
      const platform = platformOfLink(link);
      if (!platform) return json({ error: "Only public https links from YouTube, Instagram, LinkedIn or X are accepted." }, 400);
      const c = classify(link);
      if (!c) return json({ error: "That link is not a single video page. Paste the link of one video, not a profile, channel or playlist." }, 400);
      provenance = { kind: "link", platform, url: c.url, fileName: null, title: null, creator: null };
      if (platform !== "yt") {
        const body: NeedsUpload = { status: "needs_upload", platform, provenance, reason: `${NAME[platform]} does not let apps read its videos without signing in, so the video could not be watched from the link. Download or screen-record it and upload the file instead. Nothing was charged.` };
        return json(body);
      }
      yt = { url: `https://www.youtube.com/watch?v=${c.id}`, id: c.id };
      media = { kind: "link", url: yt.url };
    }

    try { if (!await deps.reserve(session.userId)) return json({ error: "AI limit reached: 100 requests per account and 1,000 total per rolling hour. Try again later." }, 429); }
    catch { return json({ error: "AI quota is unavailable. Nothing was analysed." }, 503); }

    const now = (deps.now ?? (() => new Date()))().toISOString();
    const detailsP = yt ? deps.ytDetails(yt.url, yt.id).catch(() => null) : Promise.resolve(null);
    let watched: Watched;
    try { watched = await deps.watch(media, ctx); }
    catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "ZodError" || (e instanceof Error && e.message === "no json") || e instanceof SyntaxError) return json({ error: "The AI watched the video but its answer was not in the expected shape. One request was used; nothing was retried. Try again." }, 502);
      const status = (e as { httpStatus?: number }).httpStatus;
      return json({ error: status === 400 || status === 422 ? "The AI service would not accept this video (it may be private, age-restricted or too long). Try uploading the file instead." : "The AI video service failed. Nothing was retried automatically." }, 502);
    }
    const o = watched.observed;
    if (!o.canSee || watched.videoTokens === 0) return json({ error: "The AI could not open the video frames, so no analysis is shown. Try uploading the file instead." }, 502);
    const details = await detailsP;
    if (details) { provenance.title = details.title; provenance.creator = details.author || null; }
    const metrics: Metrics = {
      views: yt ? (details?.views != null ? { value: details.views, source: "YouTube video page", fetchedAt: now } : unknownMetric("YouTube video page (not readable)")) : unknownMetric("not available for uploaded files"),
      likes: unknownMetric(yt ? "YouTube does not show likes to apps without a key" : "not available for uploaded files"),
      comments: unknownMetric(yt ? "not read" : "not available for uploaded files"),
      published: { value: null, source: "not read" },
    };
    const audio = o.speechHeard && watched.audioTokens > 0;
    const body: ReferenceAnalysisResult = {
      status: "analysed",
      mode: audio ? "video+audio" : "video-only",
      evidence: `${MODEL} received the ${hasFile ? "uploaded file" : "YouTube video"} directly (${watched.videoTokens} video tokens, ${watched.audioTokens} audio tokens). ${audio ? "Speech was heard." : watched.audioTokens > 0 ? "Audio was read but no speech was heard." : "No audio track was read."} No transcript or metrics were typed in.`,
      provenance,
      observed: o,
      metrics,
      // No comparable baseline is collected, so performance stays unknown and no warning is raised.
      warning: performanceWarning(metrics.views.value, null, o.fitCaution),
      analysedAt: now,
    };
    return json(body);
  };
}

export const handleReferenceAnalysis = createAnalysisHandler({
  authenticate: authenticateReference,
  reserve: reserveReferenceSearch,
  watch: watchWithGateway,
  ytDetails: youtubeDetails,
});
