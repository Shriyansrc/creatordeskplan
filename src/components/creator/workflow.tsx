import { useState } from "react";
import type { CaptionsResult, PlanResult, Platform, ResearchResult, ScriptResult } from "@/lib/ai/contracts";
import { callAI, NOT_CONNECTED_COPY, useAIConnection, useServiceStatus, type AIConnection } from "@/lib/ai/client";
import { ALL_PLATFORMS, DEFAULT_NICHES, PLATFORM_FORMATS, PLATFORM_NAMES, SAMPLE_SCRIPT, SCRIPT_SECTIONS, selectedPlatforms, type SetShared, type StudioShared } from "@/lib/creator-shared";
import { usePersistentState } from "@/lib/use-persistent-state";
import { getSessionExport } from "@/lib/editor/session-store";
import { useEffect } from "react";
import { PlatformMark } from "./platform-mark";
import { ReferencePanel } from "./reference-panel";
import { SectionMedia } from "./section-media";
import { ReelJobButton } from "./reel-jobs";
import type { SectionKey } from "@/lib/editor/session-store";

type Go = (screen: "audience" | "research" | "calendar" | "script" | "clips") => void;
type PlanTopic = PlanResult["topics"][number];

const SAMPLE_PAINS = [
  ["Revision feels endless", "I read it again and still forget."],
  ["No idea what to practise", "Worksheets feel random."],
  ["Notes take too long", "Copying chapters eats the evening."],
];

function Heading({ title, sub }: { title: string; sub: string }) {
  return <div style={{ marginBottom: 20 }}><h1>{title}</h1><p className="sub">{sub}</p></div>;
}

function ProviderLine({ connection }: { connection: AIConnection }) {
  if (connection.state === "checking") return <p className="note">Checking AI provider…</p>;
  if (connection.state === "connected") return <p className="note"><span className="tg r">Connected</span> AI output will be returned by the configured provider.</p>;
  return <p className="note"><span className="tg n">Not connected</span> {NOT_CONNECTED_COPY}</p>;
}

function ErrorLine({ message }: { message: string }) {
  return message ? <div className="notice" role="alert">{message}</div> : null;
}

export function PlatformsScreen({ st, set, go }: { st: StudioShared; set: SetShared; go: Go }) {
  const connection = useAIConnection();
  const [goals, setGoals] = usePersistentState("platform-goals", st.goal);
  const [advice, setAdvice] = usePersistentState<{ platform: Platform; reason: string }[] | null>("platform-advice", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const recommend = async () => {
    setLoading(true); setError("");
    try {
      const result = await callAI<unknown, { recommendations: { platform: Platform; reason: string }[] }>("platforms", { goals, topic: st.topic, current: selectedPlatforms(st) });
      setAdvice(result.recommendations);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recommendation failed"); }
    finally { setLoading(false); }
  };
  const useAdvice = () => {
    if (!advice?.length) return;
    set({ plats: Object.fromEntries(ALL_PLATFORMS.map((platform) => [platform, advice.some((item) => item.platform === platform)])) });
  };
  return <div>
    <Heading title="Where will you post?" sub="Choose Instagram, YouTube, LinkedIn or X yourself, or let AI recommend platforms from your goals. You can change the choice before continuing." />
    <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
      <div className="nav">{(["choose", "recommend"] as const).map((mode) => <button key={mode} className={st.mode === mode ? "on" : ""} onClick={() => set({ mode })}>{mode === "choose" ? "I will choose" : "Let AI decide"}</button>)}</div>
      <span className="tg n">Topic: {st.topic}</span>
    </div>
    {st.mode === "recommend" && <div className="panel" style={{ marginBottom: 14 }}>
      <label className="lab" htmlFor="platform-goals">Your goals</label>
      <textarea id="platform-goals" className="field" rows={3} value={goals} onChange={(event) => setGoals(event.target.value)} />
      <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={connection.state !== "connected" || loading || goals.trim().length < 2} onClick={recommend}>{loading ? "Getting recommendation…" : advice ? "Retry recommendation" : "Get AI recommendation"}</button>
        {advice && <button className="btn g" onClick={useAdvice}>Use this recommendation</button>}
      </div>
      <ProviderLine connection={connection} /><ErrorLine message={error} />
      {advice && <div className="stack" style={{ marginTop: 12 }}>{advice.map((item) => <div className="card row" key={item.platform}><PlatformMark platform={item.platform} /><div><b>{PLATFORM_NAMES[item.platform]}</b><div style={{ fontSize: 13.5 }}>{item.reason}</div></div><span className="tg r">Connected AI output</span></div>)}</div>}
    </div>}
    <div className="panel"><table><thead><tr><th>Platform</th><th>Formats</th><th>Direct posting</th><th>Selected</th></tr></thead><tbody>
      {ALL_PLATFORMS.map((platform) => <tr key={platform}><td><div className="row"><PlatformMark platform={platform} /><b>{PLATFORM_NAMES[platform]}</b></div></td><td>{PLATFORM_FORMATS[platform]}</td><td><span className="tg n">Not connected</span></td><td><button className={"btn s" + (st.plats[platform] ? "" : " g")} aria-pressed={Boolean(st.plats[platform])} onClick={() => set({ plats: { ...st.plats, [platform]: !st.plats[platform] } })}>{st.plats[platform] ? "On" : "Off"}</button></td></tr>)}
    </tbody></table></div>
    <div style={{ marginTop: 16 }}><button className="btn" disabled={!selectedPlatforms(st).length} onClick={() => go("audience")}>Next: audience</button></div>
  </div>;
}

export function AudienceScreen({ st, go }: { st: StudioShared; go: Go }) {
  const connection = useAIConnection();
  const [research, setResearch] = usePersistentState<ResearchResult | null>("research", null);
  const [pains, setPains] = usePersistentState<string[][]>("pains", SAMPLE_PAINS);
  const [also, setAlso] = usePersistentState<string[]>("also", ["Parents", "Tutors"]);
  const [editing, setEditing] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const analyze = async () => {
    setLoading(true); setError("");
    try {
      const result = await callAI<unknown, ResearchResult>("research", { topic: st.topic, goal: st.goal, niche: (DEFAULT_NICHES[st.niche] ?? DEFAULT_NICHES[0]!).t, platforms: selectedPlatforms(st), painPoints: pains.map((pain) => `${pain[0]}: ${pain[1]}`) });
      setResearch(result); setPains(result.audience.painPoints.map((pain) => [pain.title, pain.detail]));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Audience analysis failed"); }
    finally { setLoading(false); }
  };
  const searches = research?.audience.searches ?? [
    { phrase: "how to revise a chapter fast", intent: "Learn", platform: "YouTube" },
    { phrase: "cbse class 10 notes pdf", intent: "Find a resource", platform: "Google" },
    { phrase: "best way to study for boards", intent: "Compare methods", platform: "Instagram" },
  ];
  return <div>
    <Heading title="Who you are talking to." sub="Setup choices feed this analysis. Review the audience and pain points before they feed research and the 30-day plan." />
    <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}><button className="btn" disabled={connection.state !== "connected" || loading} onClick={analyze}>{loading ? "Analyzing…" : research ? "Regenerate analysis" : "Analyze audience with AI"}</button><span className={"tg " + (research ? "r" : "e")}>{research ? "Connected AI output" : "Sample until AI runs"}</span></div>
    <ProviderLine connection={connection} /><ErrorLine message={error} />
    <div className="g2" style={{ gridTemplateColumns: "1fr 1.4fr", marginTop: 12 }}>
      <div className="panel"><div className="lab">Ideal audience profile</div><h2>{research?.audience.profile ?? "Class 9 to 12 student, studying for boards"}</h2><div style={{ lineHeight: 1.9, margin: "12px 0" }}><b>Age</b> {research?.audience.age ?? "14 to 18"}<br /><b>Where</b> {research?.audience.location ?? "India, mostly cities"}<br /><b>Uses</b> {research?.audience.platforms.join(", ") || "Phone first, Instagram and YouTube"}<br /><b>Online</b> {research?.audience.activeTimes ?? "Evenings and weekends"}</div><span className={"tg " + (research ? "r" : "e")}>{research ? "AI estimate, review it" : "Sample estimate"}</span><div className="lab" style={{ marginTop: 18 }}>Also reaches</div>{["Parents", "Tutors", "Teachers"].map((item) => <button key={item} className={"chip" + (also.includes(item) ? " on" : "")} aria-pressed={also.includes(item)} onClick={() => setAlso(also.includes(item) ? also.filter((value) => value !== item) : [...also, item])}>{item}</button>)}</div>
      <div><div className="lab">Pain points, ranked</div><div className="stack">{pains.map((pain, index) => <div key={index} className="card row"><span className="k" style={{ fontSize: 26, width: 30 }}>{index + 1}</span>{editing === index ? <div style={{ flex: 1 }}><input className="inp" aria-label="Pain point" value={pain[0] ?? ""} onChange={(event) => setPains(pains.map((item, i) => i === index ? [event.target.value, item[1] ?? ""] : item))} /><input className="inp" aria-label="Detail" value={pain[1] ?? ""} onChange={(event) => setPains(pains.map((item, i) => i === index ? [item[0] ?? "", event.target.value] : item))} /></div> : <div style={{ flex: 1 }}><b>{pain[0]}</b><div style={{ fontSize: 13.5 }}>{pain[1]}</div></div>}<button className="btn s g" onClick={() => setEditing(editing === index ? -1 : index)}>{editing === index ? "Done" : "Edit"}</button></div>)}</div>
        <div className="lab" style={{ marginTop: 20 }}>What people search for</div><div className="panel" style={{ padding: "4px 14px" }}><table><thead><tr><th>Search phrase</th><th>Intent</th><th>Where</th><th>Source</th></tr></thead><tbody>{searches.map((row) => <tr key={row.phrase}><td>{row.phrase}</td><td>{row.intent}</td><td>{row.platform}</td><td><span className={"tg " + (research ? "r" : "e")}>{research ? "AI estimate" : "Sample"}</span></td></tr>)}</tbody></table></div>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => go("research")}>Next: research</button>
      </div>
    </div>
  </div>;
}

export function ResearchScreen({ st, go }: { st: StudioShared; go: Go }) {
  const connection = useAIConnection();
  const [research, setResearch] = usePersistentState<ResearchResult | null>("research", null);
  const [pains] = usePersistentState<string[][]>("pains", SAMPLE_PAINS);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setLoading(true); setError("");
    try {
      const result = await callAI<unknown, ResearchResult>("research", { topic: st.topic, goal: st.goal, niche: (DEFAULT_NICHES[st.niche] ?? DEFAULT_NICHES[0]!).t, platforms: selectedPlatforms(st), painPoints: pains.map((pain) => `${pain[0]}: ${pain[1]}`) });
      setResearch(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Research failed"); }
    finally { setLoading(false); }
  };
  const ideas = research?.referenceIdeas.filter((idea) => filter === "All" || idea.platform === filter) ?? [];
  const samples = [
    { title: "Sample: 3 mistakes in your notes", platform: "ig" as Platform, format: "Reel", why: "Clear hook, one idea, text on screen", searchQuery: "", scriptAngle: "" },
    { title: "Sample: 10 chapter summary slides", platform: "ig" as Platform, format: "Carousel", why: "Question first, recap last", searchQuery: "", scriptAngle: "" },
    { title: "Sample: Revise a chapter in 10 minutes", platform: "yt" as Platform, format: "Short", why: "Shows the method, not a lecture", searchQuery: "", scriptAngle: "" },
  ];
  const rows = research ? ideas : samples.filter((idea) => filter === "All" || idea.platform === filter);
  return <div>
    <Heading title="Research the angle, not a copy." sub="Audience pain points feed keywords and reference ideas. AI research needs a live data source, so it stays Not connected without one." />
    <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}><button className="btn" disabled={connection.state !== "connected" || loading} onClick={run}>{loading ? "Researching…" : research ? "Regenerate research" : "Run AI research"}</button>{["All", "ig", "yt", "li", "x"].map((item) => <button key={item} className={"chip" + (filter === item ? " on" : "")} onClick={() => setFilter(item)}>{item === "All" ? item : PLATFORM_NAMES[item as Platform]}</button>)}</div>
    <ProviderLine connection={connection} /><ErrorLine message={error} />
    {research && <div className="panel" style={{ marginTop: 12 }}><div className="lab">Keywords · Estimated, not live data</div>{research.keywords.map((keyword) => <div className="card" style={{ marginBottom: 8 }} key={keyword.keyword}><b>{keyword.keyword}</b> <span className="tg e">{keyword.trend}</span><div style={{ fontSize: 13.5 }}>{keyword.reason}</div></div>)}</div>}
    <div className="panel" style={{ marginTop: 12 }}><div className="row" style={{ marginBottom: 10 }}><div className="lab" style={{ margin: 0 }}>Reference ideas and script angles</div><span className="sp" /><span className={"tg " + (research ? "e" : "n")}>{research ? "AI ideas, not verified videos" : "Sample"}</span></div><div className="stack">{rows.map((idea) => <div className="card" key={idea.title}><div className="row"><PlatformMark platform={idea.platform} /><div style={{ flex: 1 }}><b>{idea.title}</b><div style={{ fontSize: 13.5 }}>{idea.format} · {idea.why}</div>{idea.scriptAngle && <div style={{ fontSize: 13.5, marginTop: 6 }}>Script angle: {idea.scriptAngle}</div>}{idea.searchQuery && <div className="note">Search yourself: {idea.searchQuery}</div>}</div></div></div>)}</div>{research && !rows.length && <p className="note">No reference ideas for this filter.</p>}</div>
    <ReferencePanel st={st} pains={pains} />
    <button className="btn" style={{ marginTop: 14 }} onClick={() => go("calendar")}>Use this in the 30-day plan</button>
  </div>;
}

const SAMPLE_TOPICS: PlanTopic[] = [
  { id: "sample-1", title: "3 notes mistakes that cost marks", day: 10, rank: 1, score: 86, reason: "Fixes revision feels endless", painPoint: "Revision feels endless", kind: "pain point", platform: "ig" },
  { id: "sample-2", title: "Why rereading fails", day: 3, rank: 2, score: 78, reason: "Explains a common study misconception", painPoint: "No idea what to practise", kind: "authority", platform: "yt" },
  { id: "sample-3", title: "10-slide chapter recap", day: 8, rank: 3, score: 68, reason: "A saveable revision format", painPoint: "Notes take too long", kind: "trending", platform: "ig" },
];

export function CalendarScreen({ st, set, go }: { st: StudioShared; set: SetShared; go: Go }) {
  const connection = useAIConnection();
  const [research] = usePersistentState<ResearchResult | null>("research", null);
  const [plan, setPlan] = usePersistentState<PlanResult | null>("plan", null);
  const [ideas, setIdeas] = usePersistentState<Record<number, string>>("ideas", {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const generate = async () => {
    if (!research) { setError("Run audience research first so the plan has real inputs."); return; }
    setLoading(true); setError("");
    try {
      const result = await callAI<unknown, PlanResult>("plan", { topic: st.topic, goal: st.goal, niche: (DEFAULT_NICHES[st.niche] ?? DEFAULT_NICHES[0]!).t, platforms: selectedPlatforms(st), research });
      setPlan(result); set({ day: result.calendar[0]?.day ?? 1 });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Plan generation failed"); }
    finally { setLoading(false); }
  };
  const topics = [...(plan?.topics ?? SAMPLE_TOPICS)].sort((a, b) => a.rank - b.rank);
  const selected = plan?.topics.find((topic) => topic.day === st.day) ?? SAMPLE_TOPICS.find((topic) => topic.day === st.day);
  return <div>
    <div className="row"><div style={{ flex: 1 }}><Heading title="Your ranked 30-day plan." sub="Thirty topics mix trends, audience pain points and authority. The ranking builds the calendar, then each day feeds its script." /></div><span className={"tg " + (plan ? "e" : "n")}>{plan ? "Estimated, not live data" : "Sample plan"}</span></div>
    <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}><button className="btn" disabled={connection.state !== "connected" || loading} onClick={generate}>{loading ? "Planning 30 days…" : plan ? "Regenerate 30-day plan" : "Generate 30-day plan"}</button><button className="btn g" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add an idea"}</button></div>
    <ProviderLine connection={connection} /><ErrorLine message={error} />
    {adding && <div className="card row" style={{ margin: "12px 0" }}><input className="inp" aria-label={`Idea for day ${st.day}`} value={draft} onChange={(event) => setDraft(event.target.value)} /><button className="btn s" onClick={() => { if (draft.trim()) { setIdeas({ ...ideas, [st.day]: draft.trim() }); setDraft(""); setAdding(false); } }}>Save to day {st.day}</button></div>}
    <div className="g2 grid-r" style={{ gridTemplateColumns: "1fr 340px", marginTop: 12 }}><div className="cal">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="hdr">{day}</div>)}{Array.from({ length: 30 }, (_, index) => index + 1).map((day) => { const topic = plan?.topics.find((item) => item.day === day) ?? SAMPLE_TOPICS.find((item) => item.day === day); return <button key={day} className={"d" + (topic || ideas[day] ? " has" : "") + (st.day === day ? " sel" : "")} onClick={() => set({ day })}>{day}{(topic || ideas[day]) && <div><span className={`plat ${topic?.platform ?? "ig"}`}>{(topic?.platform ?? "ig").toUpperCase()}</span><span className="t">{ideas[day] ? "Your idea" : topic?.kind ?? "Idea"}</span></div>}</button>; })}</div>
      <div className="stack"><div className="lab">Ranked topics, best first</div><div className="stack topic-list">{topics.map((topic) => <button key={topic.id} className={"card" + (topic.day === st.day ? " sel" : "")} onClick={() => set({ day: topic.day })}><div className="row"><b>{topic.rank}. {topic.title}</b><span className="sp" /><span className="tg e">{topic.score}/100</span></div><div style={{ fontSize: 13 }}>Day {topic.day} · {topic.kind} · {topic.reason}</div></button>)}</div><div className="panel"><div className="lab">Day {st.day}</div><p style={{ fontSize: 14 }}>{ideas[st.day] ?? selected?.title ?? "Nothing planned. Add your own idea."}</p>{selected && <p className="note">{selected.reason} · {selected.painPoint}<br />Estimated, not live data.</p>}<button className="btn" style={{ marginTop: 12 }} disabled={!selected && !ideas[st.day]} onClick={() => go("script")}>Write script</button></div></div>
    </div>
  </div>;
}

export function ScriptScreen({ st, go }: { st: StudioShared; go: Go }) {
  const connection = useAIConnection();
  const services = useServiceStatus();
  const [plan] = usePersistentState<PlanResult | null>("plan", null);
  const [ideas] = usePersistentState<Record<number, string>>("ideas", {});
  const [research] = usePersistentState<ResearchResult | null>("research", null);
  const [pains] = usePersistentState<string[][]>("pains", SAMPLE_PAINS);
  const [text, setText] = usePersistentState<Record<string, string>>("script", {});
  const [source, setSource] = usePersistentState<"sample" | "template" | "connected">("script-source", "sample");
  const [options, setOptions] = usePersistentState<ScriptResult["options"] | null>("script-options", null);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const topic = ideas[st.day] ?? plan?.topics.find((item) => item.day === st.day)?.title ?? SAMPLE_TOPICS.find((item) => item.day === st.day)?.title ?? SAMPLE_TOPICS[0]?.title ?? st.topic;
  const planTopic = plan?.topics.find((item) => item.day === st.day);
  const platform = planTopic?.platform ?? selectedPlatforms(st)[0] ?? "ig";
  const painPoint = planTopic?.painPoint ?? pains[0]?.[0] ?? "getting stuck";
  const generate = async (rewrite = false) => {
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await callAI<unknown, ScriptResult>("script", { topic, niche: (DEFAULT_NICHES[st.niche] ?? DEFAULT_NICHES[0]!).t, goal: st.goal, platform, painPoint, researchKeywords: research?.keywords.map((item) => item.keyword) ?? [], current: rewrite ? { ...SAMPLE_SCRIPT, ...text } : undefined, instruction: rewrite ? instruction : undefined });
      setText({ hook: result.hook, problem: result.problem, solution: result.solution, cta: result.cta, tags: result.hashtags.join(" ") });
      setOptions(result.options); setSource("connected"); if (rewrite) setInstruction("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Script generation failed"); }
    finally { setLoading(false); }
  };
  const fillTemplate = () => {
    const niche = (DEFAULT_NICHES[st.niche] ?? DEFAULT_NICHES[0]!).t.toLowerCase();
    setText({ hook: `If ${painPoint.toLowerCase()} sounds like you, this is for you.`, problem: `Most people working on ${niche} keep running into ${painPoint.toLowerCase()}. Doing more of the same does not fix it.`, solution: "Try one small change this week and write down what happens. Keep what works, drop what does not.", cta: `Follow for the next part, and comment your biggest struggle with ${niche}.`, tags: text["tags"] ?? SAMPLE_SCRIPT.tags });
    setOptions(null); setSource("template"); setNotice("Basic, runs in your browser. This fixed template is not AI writing.");
  };
  return (
    <div>
      <Heading title="Make the words sound like you." sub={`${topic} · ${PLATFORM_NAMES[platform]} · hook, problem, solution and CTA`} />
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <button className="btn" disabled={connection.state !== "connected" || loading} onClick={() => generate(false)}>
          {loading ? "Writing…" : source === "connected" ? "Regenerate" : "Generate script with AI"}
        </button>
        <span className={"tg " + (source === "connected" ? "r" : "e")}>
          {source === "connected" ? "Connected AI output" : source === "template" ? "Basic, runs in your browser" : "Sample script"}
        </span>
      </div>
      <ProviderLine connection={connection} />
      <ErrorLine message={error} />
      {notice && <div className="notice">{notice}</div>}
      <div className="panel" style={{ margin: "12px 0" }}>
        <label className="lab" htmlFor="script-instruction">Edit by instruction</label>
        <div className="row">
          <input id="script-instruction" className="field" placeholder="For example: make the hook more direct" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
          <button className="btn" disabled={connection.state !== "connected" || loading || !instruction.trim()} onClick={() => generate(true)}>Rewrite</button>
        </div>
      </div>
      <div className="g2 grid-r" style={{ gridTemplateColumns: "1fr 280px" }}>
        <div className="panel">
          {SCRIPT_SECTIONS.map(([key, label]) => {
            const choices = options && key !== "tags" ? options[key] : null;
            return (
              <div key={key} style={{ marginBottom: 14 }}>
                <div className="row">
                  <div className="lab" style={{ margin: 0 }}>{label}</div>
                  <span className="sp" />
                  {choices && <span>{(["a", "b"] as const).map((choice) => (
                    <button key={choice} className="chip" onClick={() => setText({ ...text, [key]: choices[choice] })}>Option {choice.toUpperCase()}</button>
                  ))}</span>}
                </div>
                <textarea className="field" style={{ marginTop: 7 }} aria-label={`${label} text`} rows={key === "problem" || key === "solution" ? 4 : 3} value={text[key] ?? SAMPLE_SCRIPT[key]} onChange={(event) => setText({ ...text, [key]: event.target.value })} />
                {key !== "tags" && <SectionMedia section={key as SectionKey} label={label} text={text[key] ?? SAMPLE_SCRIPT[key] ?? ""} voiceOn={services.state === "ready" && services.voice} videoOn={services.state === "ready" && services.video} />}
              </div>
            );
          })}
        </div>
        <div className="stack">
          <div className="dark"><div className="lab">Built from</div><p style={{ fontSize: 14 }}>Topic: {topic}<br />Pain point: {painPoint}<br />Platform: {PLATFORM_NAMES[platform]}<br />{research ? "Connected research output" : "Sample research until connected"}</p></div>
          <div className="panel"><div className="lab">No-provider option</div><p style={{ fontSize: 14 }}>Fill a simple template from your niche and top pain point, then edit every line.</p><button className="btn s g" style={{ marginTop: 10 }} onClick={fillTemplate}>Fill local template</button></div>
          <button className="btn" onClick={() => go("clips")}>Next: record clips</button>
        </div>
      </div>
    </div>
  );
}

function scriptCaption(script: Record<string, string>) {
  return [script["hook"] ?? SAMPLE_SCRIPT.hook, script["solution"] ?? SAMPLE_SCRIPT.solution, script["cta"] ?? SAMPLE_SCRIPT.cta, script["tags"] ?? SAMPLE_SCRIPT.tags].join("\n\n");
}

export function PublishScreen({ st, set }: { st: StudioShared; set: SetShared }) {
  const connection = useAIConnection();
  const platforms = selectedPlatforms(st);
  const active = platforms.includes(st.pub as Platform) ? st.pub as Platform : platforms[0] ?? "ig";
  const [captions, setCaptions] = usePersistentState<Record<string, string>>("caps", {});
  const [captionSource, setCaptionSource] = usePersistentState<Record<string, string>>("caption-source", {});
  const [script] = usePersistentState<Record<string, string>>("script", {});
  const [plan] = usePersistentState<PlanResult | null>("plan", null);
  const [exported, setExported] = useState<ReturnType<typeof getSessionExport>>(null);
  const [aiUsed] = usePersistentState<{ section: string; kind: "voice" | "video" }[]>("ai-content-used", []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setExported(getSessionExport()); }, []);
  const text = captions[active] ?? scriptCaption(script);
  const topic = plan?.topics.find((item) => item.day === st.day)?.title ?? st.topic;
  const generate = async () => {
    setLoading(true); setMessage("");
    try {
      const result = await callAI<unknown, CaptionsResult>("captions", { platforms, topic, script: { hook: script["hook"] ?? SAMPLE_SCRIPT.hook, problem: script["problem"] ?? SAMPLE_SCRIPT.problem, solution: script["solution"] ?? SAMPLE_SCRIPT.solution, cta: script["cta"] ?? SAMPLE_SCRIPT.cta, hashtags: (script["tags"] ?? SAMPLE_SCRIPT.tags).split(/\s+/).filter(Boolean) } });
      const next = { ...captions }; const sources = { ...captionSource };
      for (const caption of result.captions) { next[caption.platform] = caption.text; sources[caption.platform] = "Connected AI output"; }
      setCaptions(next); setCaptionSource(sources); setMessage("AI captions generated. Nothing was posted.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Caption generation failed"); }
    finally { setLoading(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMessage("Caption copied. Nothing was posted."); }
    catch { setMessage("Copy was blocked. Select the caption and copy it yourself."); }
  };
  const download = () => {
    if (!exported) return;
    const anchor = document.createElement("a"); anchor.href = exported.url; anchor.download = exported.name; anchor.click(); setMessage("Video downloaded. Nothing was posted.");
  };
  const next = () => { const index = platforms.indexOf(active); const nextPlatform = platforms[(index + 1) % platforms.length]; if (nextPlatform) set({ pub: nextPlatform }); };
  const composer = active === "x" ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` : active === "li" ? "https://www.linkedin.com/feed/?shareActive=true" : null;
  return <div>
    <Heading title="Export, review, post manually." sub="Step through your selected platforms one at a time. Direct posting is not connected, so Creator Desk never claims a post happened." />
    {!platforms.length && <div className="notice">Choose at least one platform in setup.</div>}
    <p className="note"><b>AI content:</b> {aiUsed.length ? aiUsed.map((item) => `${item.section} (${item.kind === "voice" ? "AI voice" : "AI video"})`).join(", ") : "none, every section used your own recordings"}.</p>
    <div className="g2 grid-r" style={{ gridTemplateColumns: "300px 1fr" }}><div className="stack"><div className="lab">This video, choose a platform</div>{platforms.map((platform) => <button key={platform} style={{ width: "100%" }} className={"card row" + (active === platform ? " ring" : "")} onClick={() => set({ pub: platform })}><PlatformMark platform={platform} /><div style={{ flex: 1 }}><b>{PLATFORM_NAMES[platform]}</b><div style={{ fontSize: 12.5 }}>Direct posting: Not connected</div></div></button>)}<button className="btn g" onClick={next} disabled={platforms.length < 2}>Next platform</button><div className="panel"><div className="lab">AI captions</div><button className="btn s" disabled={connection.state !== "connected" || loading || !platforms.length} onClick={generate}>{loading ? "Writing captions…" : "Generate platform captions"}</button><ProviderLine connection={connection} /></div></div>
      <div className="panel pubrow" style={{ display: "flex", alignItems: "flex-start", gap: 20 }}><div>{exported ? <video src={exported.url} controls playsInline style={{ width: 220, maxHeight: 390, borderRadius: 14 }} aria-label="Exported video review" /> : <div className="card" style={{ width: 220, minHeight: 180 }}><b>No exported video in this session</b><p className="note">Export in the editor first. Your original clips are unchanged.</p></div>}<button className="btn" style={{ marginTop: 10, width: 220 }} disabled={!exported} onClick={download}>Download video</button></div>
        <div style={{ flex: 1 }}><div className="row"><div className="lab" style={{ margin: 0 }}>Caption for {PLATFORM_NAMES[active]}</div><span className="sp" /><span className={"tg " + (captionSource[active] ? "r" : "n")}>{captionSource[active] ?? "From your Script screen, not AI"}</span></div><textarea className="field" rows={8} aria-label="Caption" value={text} onChange={(event) => { setCaptions({ ...captions, [active]: event.target.value }); setCaptionSource({ ...captionSource, [active]: "Edited manually" }); }} /><div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}><button className="btn s g" onClick={copy}>Copy caption</button>{composer && <a className="btn s g" href={composer} target="_blank" rel="noreferrer">Open composer</a>}<button className="btn s" disabled title="Platform developer apps and approvals are required">Post: Not connected</button></div>
          {active === "ig" && <p className="note">Instagram has no web composer that accepts this pre-filled upload. Download the video, open Instagram, create a Reel, attach the file and paste the caption.</p>}
          {active === "yt" && <p className="note">YouTube has no public web link that pre-fills this upload. Download the video, open YouTube Studio, choose Create, upload the file and paste the caption.</p>}
          {active === "li" && <p className="note">The LinkedIn composer opens, but the downloaded video must be attached manually.</p>}
          {active === "x" && <p className="note">The X intent can carry caption text, but the downloaded video must be attached manually.</p>}
          <p className="note">Direct posting needs platform developer apps, account authorization and approvals. No post has been made.</p>{message && <div className="notice">{message}</div>}<ReelJobButton st={st} />
        </div>
      </div>
    </div>
  </div>;
}

export function ConnectionsPanel() {
  const connection = useAIConnection();
  const services = useServiceStatus();
  const svc = (on: boolean | undefined) => (services.state === "checking" ? "Checking" : on ? "Connected" : "Not connected");
  const ready = services.state === "ready" ? services : null;
  const rows = [
    ["AI provider: research, plans, scripts, platform advice, captions and prompt edits", connection.state === "connected" ? "Connected" : connection.state === "checking" ? "Checking" : "Not connected", connection.state === "connected" ? "Built-in Lovable AI (or your own key, if set)." : "Built-in AI is unavailable right now."],
    ["Accounts, Google sign-in and synced plans", "Not connected", "A backend is not enabled. Plans stay on this device."],
    ...ALL_PLATFORMS.map((platform) => [`Direct posting to ${PLATFORM_NAMES[platform]}`, "Not connected", "Platform developer apps, account authorization and approvals are required."]),
    ["Reference search (YouTube) and live research data", svc(ready?.references), ready?.references ? "YOUTUBE_API_KEY is present on the server." : "Owner must set YOUTUBE_API_KEY on the server. Instagram and X links can still be entered by you."],
    ["Voice generation", svc(ready?.voice), ready?.voice ? "Provider account answered the status check. Billed by the provider." : "Owner must set VOICE_PROVIDER and VOICE_API_KEY on the server, and the provider must answer a status check."],
    ["Video generation", svc(ready?.video), ready?.video ? "Provider account answered the status check. Billed by the provider." : "Owner must set VIDEO_PROVIDER and VIDEO_API_KEY on the server, and the provider must answer a status check."],
    ["Motion reel service", "Not connected", "Needs accounts, a database and storage, which are not enabled. Reel jobs are saved on this device only."],
    ["Live trend and analytics data", "Not connected", "No data source is configured. AI ranking is Estimated, not live data."],
  ];
  return <div style={{ marginBottom: 20 }}><div className="lab">Connections</div><div className="stack">{rows.map(([name, status, reason]) => <div className="card row" key={name}><div style={{ flex: 1 }}><b>{name}</b><div style={{ fontSize: 13 }}>{reason}</div></div><span className={"tg " + (status === "Connected" ? "r" : "n")}>{status}</span></div>)}</div></div>;
}
