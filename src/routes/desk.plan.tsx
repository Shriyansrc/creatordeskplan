import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Spinner } from "@/desk/ui";
import { patchDesk, useDesk } from "@/desk/store";
import { errorText, runPlan, runResearch, runScript } from "@/desk/api";
import type { Platform, PlanTopic } from "@/lib/ai/contracts";
import { ListenButton, ReferenceAnalysis, StylePanel, styleNotesOf } from "@/desk/extras";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { StyleResult } from "@/lib/ai/contracts";
import { ReferencePanel } from "@/components/creator/reference-panel";
import type { StudioShared } from "@/lib/creator-shared";

export const Route = createFileRoute("/desk/plan")({ component: Plan });

const PNAME: Record<Platform, string> = { ig: "Instagram", yt: "YouTube", li: "LinkedIn", x: "X" };
const TABS = ["Research", "30-day plan", "Script"] as const;

function Cite({ ids, list }: { ids?: number[] | undefined; list?: { id: number; url: string; site: string }[] | undefined }) {
  const found = (ids ?? []).map((i) => list?.find((x) => x.id === i)).filter((x): x is { id: number; url: string; site: string } => !!x);
  if (!found.length) return null;
  return <p style={{ marginTop: 6, fontSize: 14 }}>Sources: {found.map((x, i) => <span key={x.id}>{i ? ", " : ""}<a href={x.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>{x.id} ({x.site})</a></span>)}</p>;
}

function searchUrl(p: string, q: string) {
  const e = encodeURIComponent(q);
  if (p === "yt") return `https://www.youtube.com/results?search_query=${e}`;
  if (p === "ig") return `https://www.instagram.com/explore/search/keyword/?q=${e}`;
  if (p === "li") return `https://www.linkedin.com/search/results/content/?keywords=${e}`;
  return `https://x.com/search?q=${e}`;
}

function Plan() {
  const d = useDesk();
  const p = d.profile;
  const [tab, setTab] = useState<(typeof TABS)[number]>(d.plan ? "30-day plan" : "Research");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string>("");
  const [myStyle] = usePersistentState<StyleResult | null>("style", null);
  const niche = d.niche?.title ?? "";
  const base = { topic: p.topic, goal: p.goal, niche, platforms: p.platforms };
  const key = JSON.stringify(base);
  const research = d.research && d.research.key === key ? d.research.data : null;
  const plan = d.plan && d.plan.key === key ? d.plan.data : null;

  if (!niche) {
    return (
      <>
        <h1>Your plan</h1>
        <div className="dk-empty" style={{ marginTop: 24 }}><b>Choose a niche first</b>Research and the 30-day plan are built from your niche.<br /><br /><Link to="/desk/niche" className="dk-btn">Go to Niche</Link></div>
      </>
    );
  }

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setErr("");
    try { await fn(); } catch (e) { setErr(errorText(e)); }
    setBusy("");
  };
  const doResearch = () => run("research", async () => {
    const r = await runResearch({ ...base, audienceNotes: (p.audience + ". " + p.audienceNotes).slice(0, 3900), painPoints: p.painPoints.slice(0, 20) });
    patchDesk({ research: { key, data: r, at: new Date().toISOString() } });
  });
  const doPlan = () => run("plan", async () => {
    if (!research) throw new Error("Run research first.");
    const r = await runPlan({ ...base, research });
    patchDesk({ plan: { key, data: r, at: new Date().toISOString() } });
    setTab("30-day plan");
  });
  const topic: PlanTopic | undefined = plan?.topics.find((t) => t.id === sel);
  const script = topic ? d.scripts[topic.id] : undefined;
  const doScript = (instruction?: string) => run("script", async () => {
    if (!topic) return;
    const r = await runScript({ topic: topic.title, niche, goal: p.goal, platform: topic.platform, painPoint: topic.painPoint, ...(p.language ? { language: p.language } : {}), searchPhrases: (research?.audience.searches ?? []).slice(0, 20).map((x) => x.phrase), audience: [p.audience, p.audienceNotes].filter(Boolean).join(" | ").slice(0, 480), researchKeywords: (research?.keywords ?? []).slice(0, 20).map((k) => k.keyword), ...(styleNotesOf(myStyle) ? { styleNotes: styleNotesOf(myStyle) as string } : {}), ...(instruction && script ? { current: { hook: script.data.hook, problem: script.data.problem, solution: script.data.solution, cta: script.data.cta }, instruction } : {}) });
    patchDesk({ scripts: { ...d.scripts, [topic.id]: { data: r, at: new Date().toISOString() } } });
  });

  return (
    <>
      <h1>Your plan</h1>
      <p style={{ fontSize: 20, margin: "10px 0 18px" }}>Niche: <b>{niche}</b>. <Link to="/desk/niche" style={{ color: "var(--blue)" }}>Change</Link></p>
      <div className="dk-tabs" role="tablist">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={`dk-chip${tab === t ? " sel" : ""}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {err && <div className="dk-err" role="alert">{err}</div>}

      {tab === "Research" && (
        <>
          <div className="dk-row" style={{ marginBottom: 16 }}>
            <button type="button" className="dk-btn" disabled={busy !== ""} onClick={() => void doResearch()}>{busy === "research" ? <Spinner /> : null}{research ? "Run research again" : "Run research"}</button>
            {research && <button type="button" className="dk-btn secondary" disabled={busy !== ""} onClick={() => void doPlan()}>{busy === "plan" ? <Spinner /> : null}{plan ? "Rebuild 30-day plan" : "Build my 30-day plan"}</button>}
          </div>
          {!research && busy !== "research" && <div className="dk-empty"><b>Research appears here</b>Audience, pain points, search phrases, keywords and reference video ideas for "{niche}". It is built from live sources fetched when you run it, and every item links to what it came from. If the sources cannot be reached, you get an error, not a guess.</div>}
          {busy === "research" && <div className="dk-empty"><Spinner /> Researching your niche...</div>}
          {research && (
            <div className="dk-list">
              <div className="dk-item"><span className="dk-tag">{research.sources?.length ? `FROM ${research.sources.length} LIVE SOURCES` : "OLD RESULT, NO SOURCES. RUN RESEARCH AGAIN"}</span><h3 style={{ marginTop: 8 }}>Niche summary</h3><p>{research.nicheSummary}</p></div>
              <div className="dk-item"><h3>Audience</h3><p>{research.audience.profile}</p><p style={{ marginTop: 6 }}>{[research.audience.age, research.audience.location, research.audience.activeTimes].filter(Boolean).join(" · ")}</p></div>
              <div className="dk-label" style={{ marginTop: 14 }}>Pain points</div>
              {research.audience.painPoints.map((x) => <div key={x.title} className="dk-item"><h3>{x.title}</h3><p>{x.detail}</p><Cite ids={x.sourceIds} list={research.sources} /></div>)}
              <div className="dk-label" style={{ marginTop: 14 }}>What they search</div>
              {research.audience.searches.map((x) => <div key={x.phrase} className="dk-item"><h3>{x.phrase}</h3><p>{x.intent} · {x.platform}</p><Cite ids={x.sourceIds} list={research.sources} /></div>)}
              <div className="dk-label" style={{ marginTop: 14 }}>Keywords</div>
              {research.keywords.map((x) => <div key={x.keyword} className="dk-item"><h3>{x.keyword}</h3><p>{x.reason}</p><Cite ids={x.sourceIds} list={research.sources} /></div>)}
              <div className="dk-label" style={{ marginTop: 14 }}>Sources checked{research.checkedAt ? ` · ${new Date(research.checkedAt).toLocaleString()}` : ""}</div>
              {(research.sources ?? []).map((x) => (
                <div key={x.id} className="dk-item">
                  <h3>{x.id}. <a href={x.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>{x.title}</a></h3>
                  <p>{x.site}{x.snippet ? ` · ${x.snippet}` : ""}</p>
                </div>
              ))}
              <div className="dk-label" style={{ marginTop: 14 }}>Reference ideas</div>
              {research.referenceIdeas.map((x) => (
                <div key={x.title} className="dk-item">
                  <h3>{x.title}</h3>
                  <p>{PNAME[x.platform]} · {x.format}. {x.why}</p>
                  <p style={{ marginTop: 6 }}><a href={searchUrl(x.platform, x.searchQuery)} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Find real examples: {x.searchQuery}</a></p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "30-day plan" && (
        !plan ? (
          <div className="dk-empty"><b>Your 30-day plan appears here</b>{research ? "Build it from your research." : "Run research first."}<br /><br />
            {research ? <button type="button" className="dk-btn" disabled={busy !== ""} onClick={() => void doPlan()}>{busy === "plan" ? <Spinner /> : null}Build my 30-day plan</button> : <button type="button" className="dk-btn" onClick={() => setTab("Research")}>Go to research</button>}
          </div>
        ) : (
          <>
            <p style={{ marginBottom: 12 }}><span className="dk-tag est">AI ESTIMATE</span> Ranks are suggestions. Real results come from Performance after you post.</p>
            <div className="dk-cal" aria-label="30-day calendar">
              {plan.calendar.slice().sort((a, b) => a.day - b.day).map((c) => {
                const t = plan.topics.find((x) => x.id === c.topicId);
                return <button key={c.day} type="button" className={sel === t?.id ? "sel" : ""} onClick={() => { if (t) { setSel(t.id); setTab("Script"); } }} aria-label={`Day ${c.day}: ${t?.title ?? ""}`}><b>Day {c.day}</b><span>{t?.title}</span></button>;
              })}
            </div>
            <div className="dk-label" style={{ marginTop: 22 }}>Ranked topics</div>
            <div className="dk-list">
              {plan.topics.slice().sort((a, b) => a.rank - b.rank).map((t) => (
                <button key={t.id} type="button" className="dk-item" style={{ textAlign: "left", border: 0, cursor: "pointer", font: "inherit", color: "var(--ink)" }} onClick={() => { setSel(t.id); setTab("Script"); }}>
                  <h3>#{t.rank} {t.title}</h3>
                  <p>Day {t.day} · {PNAME[t.platform]} · {t.kind} · score {t.score}</p>
                  <p style={{ marginTop: 4 }}>{t.reason}</p>
                </button>
              ))}
            </div>
          </>
        )
      )}

      {tab === "Script" && (
        !topic ? (
          <div className="dk-empty"><b>Pick a topic</b>{plan ? "Choose a day in the calendar or a ranked topic." : "Build your 30-day plan first."}</div>
        ) : (
          <>
            <h2 style={{ marginBottom: 6 }}>{topic.title}</h2>
            <p style={{ marginBottom: 14 }}>Day {topic.day} · {PNAME[topic.platform]}</p>
            <div className="dk-row" style={{ marginBottom: 16 }}>
              <button type="button" className="dk-btn" disabled={busy !== ""} onClick={() => void doScript()}>{busy === "script" ? <Spinner /> : null}{script ? "Write a new script" : "Write the script"}</button>
              {script && ["Shorter", "More direct", "Stronger hook"].map((x) => <button key={x} type="button" className="dk-chip" disabled={busy !== ""} onClick={() => void doScript(x)}>{x}</button>)}
            </div>
            {!script && busy !== "script" && <div className="dk-empty"><b>Your script appears here</b>Hook, problem, solution, call to action and hashtags. You edit every word.</div>}
            {script && (
              <div className="dk-list">
                <span className="dk-tag est">AI DRAFT. EDIT IT.</span>
                {(["hook", "problem", "solution", "cta"] as const).map((k) => (
                  <label key={k} className="dk-item"><div className="dk-label">{k === "cta" ? "Call to action" : k}</div>
                    <textarea className="dk-field" rows={4} value={script.data[k]} onChange={(e) => patchDesk({ scripts: { ...d.scripts, [topic.id]: { ...script, data: { ...script.data, [k]: e.target.value } } } })} />
                  </label>
                ))}
                <div className="dk-item"><div className="dk-label">Hashtags</div><p>{script.data.hashtags.join(" ")}</p><p style={{ marginTop: 6 }}>Search phrase: {script.data.seoPhrase}</p></div>
                {script.data.title && <div className="dk-item"><div className="dk-label">Title</div><p>{script.data.title}</p></div>}
                {script.data.caption && <div className="dk-item"><div className="dk-label">Caption</div><p style={{ whiteSpace: "pre-wrap" }}>{script.data.caption}</p></div>}
                <ListenButton text={[script.data.hook, script.data.problem, script.data.solution, script.data.cta].join(" ")} />
                <Link to="/desk/create" className="dk-btn">Next: record or create</Link>
              </div>
            )}
            <h2 style={{ margin: "28px 0 6px" }}>My style</h2>
            <StylePanel />
            <h2 style={{ margin: "28px 0 6px" }}>Analyse a reference</h2>
            <ReferenceAnalysis topic={topic.title} niche={niche} />
            <h2 style={{ margin: "28px 0 6px" }}>Reference videos</h2>
            <p style={{ marginBottom: 12 }}>Search real videos on this idea or paste an Instagram or X link with the numbers you see. Nothing is fetched from those links.</p>
            <ReferencePanel st={{ topic: topic.title, goal: p.goal, niche: 99, day: topic.day } as unknown as StudioShared} pains={p.painPoints.map((x) => [x])} />
          </>
        )
      )}
    </>
  );
}
