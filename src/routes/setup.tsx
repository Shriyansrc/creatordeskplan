import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { Platform } from "@/lib/ai/contracts";
import { ALL_PLATFORMS } from "@/lib/creator-shared";
import { SetupFrame, PlatLogo, Spinner } from "@/desk/ui";
import { CAMERA, GOALS, LANGUAGES, OTHER_LANGUAGES, PLATFORM_COPY, TOOLS, getDesk, hoursLabel, patchDesk, patchProfile, useDesk } from "@/desk/store";
import { errorText, suggestAudiences, suggestGoals, suggestPlatforms, suggestTopics } from "@/desk/api";

export const Route = createFileRoute("/setup")({
  validateSearch: (s: Record<string, unknown>) => ({ step: Math.min(6, Math.max(1, Number(s["step"]) || 1)) }),
  head: () => ({ meta: [{ title: "Set up - Creator Desk" }] }),
  component: Setup,
});

const GOAL_QS = [
  { q: "What do you want people to do after watching?", opts: ["Buy or enquire", "Follow me", "Learn something", "Remember me"] },
  { q: "Who are you mostly making videos for?", opts: ["Customers", "Students", "Other creators", "People like me"] },
  { q: "How do you feel about being the face of it?", opts: ["Happy on camera", "Prefer voice only", "Not sure"] },
];
const TOPIC_QS = [
  { q: "What are you good at or know a lot about?", free: true },
  { q: "What do people usually ask you for help with?", free: true },
  { q: "What would you happily talk about for a year?", free: true },
];

function Setup() {
  const { step } = Route.useSearch();
  const nav = useNavigate();
  const go = (n: number) => void nav({ to: "/setup", search: { step: n } });
  const { profile: p } = useDesk();

  const valid: Record<number, boolean> = {
    1: p.goal.trim().length > 1,
    2: p.topic.trim().length > 2,
    3: (p.audience.trim() || p.audienceNotes.trim()).length > 1,
    4: p.platforms.length > 0,
    5: p.hours > 0 && p.tools.length > 0 && p.camera !== "" && p.language !== "",
  };
  const next: Record<number, string> = { 1: "Next: my topic", 2: "Next: my audience", 3: "Next: where I post", 4: "Next: my time & tools", 5: "Finish setup" };
  const hint: Record<number, string> = {
    1: "No card is pre-picked. You can change this later.",
    2: "Empty until you type. You can change this later.",
    3: "Pain points are AI estimates until research checks them.",
    4: "Nothing is pre-picked. Posting always needs your approval.",
    5: "Saved to your profile. Edit anytime in Settings.",
  };

  if (step === 6) return <Done go={go} />;
  const body = step === 1 ? <GoalStep /> : step === 2 ? <TopicStep /> : step === 3 ? <AudienceStep /> : step === 4 ? <PlatformStep /> : <TimeStep />;
  return (
    <SetupFrame
      step={step}
      foot={
        <>
          <button type="button" className="dk-link" style={{ color: "var(--mute)" }} onClick={() => (step === 1 ? void nav({ to: "/" }) : go(step - 1))}>Back</button>
          <span>{hint[step]}</span>
          <button
            type="button"
            className="dk-btn"
            disabled={!valid[step]}
            onClick={() => {
              if (step === 5) patchProfile({ setupDone: true });
              go(step === 5 ? 6 : step + 1);
            }}
          >
            {next[step]}
          </button>
        </>
      }
    >
      {body}
    </SetupFrame>
  );
}

function Head({ no, title, intro }: { no: string; title: string; intro: string }) {
  return (
    <>
      <div className="dk-eyebrow">{no}</div>
      <div className="dk-intro">
        <h1 style={{ maxWidth: 640 }}>{title}</h1>
        <p>{intro}</p>
      </div>
    </>
  );
}

function Pick({ sel, onClick, title, text, mini, icon }: { sel: boolean; onClick: () => void; title: string; text?: string; mini?: string; icon?: React.ReactNode }) {
  return (
    <button type="button" className={`dk-choice${sel ? " sel" : ""}`} onClick={onClick} aria-pressed={sel}>
      <span className="sw" />
      <h3>{icon}{title}</h3>
      {text && <p>{text}</p>}
      {mini && <div className="mini">{mini}</div>}
    </button>
  );
}

function Questions({ qs, onSubmit, busy, label }: { qs: { q: string; opts?: string[]; free?: boolean }[]; onSubmit: (a: { question: string; answer: string }[]) => void; busy: boolean; label: string }) {
  const [ans, setAns] = useState<string[]>(qs.map(() => ""));
  const ready = ans.filter((a) => a.trim()).length >= 1;
  return (
    <div className="dk-panel" style={{ marginTop: 18 }}>
      {qs.map((x, i) => (
        <div key={x.q} style={{ marginBottom: 18 }}>
          <div className="dk-label">{x.q}</div>
          {x.opts ? (
            <div className="dk-chips">
              {x.opts.map((o) => (
                <button key={o} type="button" className={`dk-chip${ans[i] === o ? " sel" : ""}`} onClick={() => setAns(ans.map((a, j) => (j === i ? o : a)))}>{o}</button>
              ))}
            </div>
          ) : (
            <input className="dk-field" value={ans[i]} onChange={(e) => setAns(ans.map((a, j) => (j === i ? e.target.value : a)))} placeholder="Type it in your own words..." />
          )}
        </div>
      ))}
      <button type="button" className="dk-btn" disabled={!ready || busy} onClick={() => onSubmit(qs.map((x, i) => ({ question: x.q, answer: (ans[i] ?? "").trim() })).filter((x) => x.answer))}>
        {busy ? <Spinner /> : null}{label}
      </button>
    </div>
  );
}

function GoalStep() {
  const { profile: p } = useDesk();
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [options, setOptions] = useState<{ goal: string; why: string }[]>([]);
  return (
    <>
      <Head no="01 / Your goal" title="What should your videos do?" intro="This steers your topics, your scripts and where we suggest posting." />
      <div className="dk-g3">
        <Pick sel={p.goal === GOALS[0]} onClick={() => patchProfile({ goal: GOALS[0] })} title="Grow my business" text="Help the right people understand what I offer and trust it." mini="Examples: explainers, proof, behind the scenes" />
        <Pick sel={p.goal === GOALS[1]} onClick={() => patchProfile({ goal: GOALS[1] })} title="Build my personal brand" text="Share what I know. Become known for it." mini="Examples: lessons, stories, useful tips" />
        <Pick sel={help} onClick={() => { if (!help) patchProfile({ goal: "" }); setHelp(!help); }} title="Help me decide" text="Answer three quick questions and we suggest a goal, with reasons." mini="You always make the final call" />
      </div>
      {help && (
        <Questions
          qs={GOAL_QS}
          busy={busy}
          label="Suggest goals"
          onSubmit={async (a) => {
            setBusy(true);
            setErr("");
            try {
              setOptions((await suggestGoals(a)).goals);
            } catch (e) {
              setErr(errorText(e));
            }
            setBusy(false);
          }}
        />
      )}
      {err && <div className="dk-err" role="alert">{err}</div>}
      {options.length > 0 && (
        <div className="dk-g3" style={{ marginTop: 18 }}>
          {options.map((o) => (
            <Pick key={o.goal} sel={p.goal === o.goal} onClick={() => patchProfile({ goal: o.goal })} title={o.goal} text={o.why} mini="AI suggestion" />
          ))}
        </div>
      )}
      {p.goal && !GOALS.includes(p.goal as (typeof GOALS)[number]) && options.length === 0 && <div className="dk-note" style={{ marginTop: 18 }}>Your goal: <b>{p.goal}</b></div>}
    </>
  );
}

function TopicStep() {
  const { profile: p } = useDesk();
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [options, setOptions] = useState<{ title: string; why: string }[]>([]);
  return (
    <>
      <Head no="02 / Your topic" title="What do you make content about?" intro="Type it in your own words. Your research, plan and scripts all start from this answer." />
      <div style={{ maxWidth: 760 }}>
        <input className="dk-field" autoFocus value={p.topic} onChange={(e) => patchProfile({ topic: e.target.value })} placeholder="Type it in your own words..." aria-label="Your topic" />
        <div className="dk-row" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 15, color: "var(--mute)" }}>No default topic is assumed.</span>
          <button type="button" className="dk-link" onClick={() => setHelp(!help)}>Not sure? Answer 3 questions and we suggest topics</button>
        </div>
        {help && (
          <Questions
            qs={TOPIC_QS}
            busy={busy}
            label="Suggest topics"
            onSubmit={async (a) => {
              setBusy(true);
              setErr("");
              try {
                setOptions((await suggestTopics(a, p.goal)).topics);
              } catch (e) {
                setErr(errorText(e));
              }
              setBusy(false);
            }}
          />
        )}
        {err && <div className="dk-err" role="alert">{err}</div>}
        {options.length > 0 && (
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {options.map((o) => (
              <Pick key={o.title} sel={p.topic === o.title} onClick={() => patchProfile({ topic: o.title })} title={o.title} text={o.why} />
            ))}
          </div>
        )}
        <div className="dk-note" style={{ marginTop: 18 }}><b>The AI asks before it assumes.</b> It confirms your topic in one line before building anything on it.</div>
      </div>
    </>
  );
}

const SEP = " | ";

function AudienceStep() {
  const { profile: p, audienceSuggestions: s } = useDesk();
  const key = `${p.topic}||${p.goal}`;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const asked = useRef("");
  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await suggestAudiences(p.topic, p.goal);
      patchDesk({ audienceSuggestions: { key, items: r.audiences } });
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  useEffect(() => {
    if (s?.key === key || asked.current === key || !p.topic) return;
    asked.current = key;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const items = s?.key === key ? s.items : [];
  const chosen = p.audience ? p.audience.split(SEP).filter(Boolean) : [];
  return (
    <>
      <Head no="03 / Your audience" title="Who should watch?" intro="You don't need to know your audience beforehand. We suggest audiences from your topic, with their pain points. Pick one or more, or write your own." />
      <div className="dk-g2" style={{ alignItems: "start" }}>
        <div>
          {busy && <div className="dk-empty"><Spinner /> Finding audiences for "{p.topic}"...</div>}
          {!busy && items.length === 0 && !err && <div className="dk-empty"><b>Audience suggestions appear here</b>Built from your topic on the last screen. Nothing is chosen for you.</div>}
          {err && <div className="dk-err" role="alert">{err} <button type="button" className="dk-link" onClick={() => void run()}>Try again</button></div>}
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((a) => (
              <Pick
                key={a.name}
                sel={chosen.includes(a.name)}
                onClick={() => {
                  const next = chosen.includes(a.name) ? chosen.filter((x) => x !== a.name) : [...chosen, a.name];
                  const picked = items.filter((x) => next.includes(x.name));
                  const pains = Array.from(new Set(picked.flatMap((x) => x.painPoints.map((y) => y.title))));
                  patchProfile({ audience: next.join(SEP), painPoints: pains });
                }}
                title={a.name}
                text={a.why}
                mini={a.painPoints.map((x) => x.title).join(" · ")}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="dk-label">Add your own viewers</div>
          <textarea className="dk-field" value={p.audienceNotes} onChange={(e) => patchProfile({ audienceNotes: e.target.value })} placeholder="Add your own viewers, in addition to any you picked..." />
          <p style={{ fontSize: 15, marginTop: 10 }}>Either way, pain points are researched and shown with their sources before your plan uses them.</p>
        </div>
      </div>
    </>
  );
}

function PlatformStep() {
  const { profile: p } = useDesk();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (id: Platform) =>
    patchProfile({ aiPlatforms: false, platformReasons: [], platforms: getDesk().profile.platforms.includes(id) ? getDesk().profile.platforms.filter((x) => x !== id) : [...getDesk().profile.platforms, id] });
  const decide = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await suggestPlatforms(`${p.goal}. Audience: ${[p.audience, p.audienceNotes].filter(Boolean).join(" | ")}`, p.topic);
      patchProfile({ aiPlatforms: true, platforms: r.recommendations.map((x) => x.platform), platformReasons: r.recommendations });
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  return (
    <>
      <Head no="04 / Your platforms" title="Choose where you post" intro="Pick any, or let us recommend from your goal and audience. Export posts to each platform one by one." />
      <div className="dk-g4">
        {ALL_PLATFORMS.map((id) => (
          <Pick key={id} sel={p.platforms.includes(id)} onClick={() => toggle(id)} icon={<PlatLogo platform={id} />} title={PLATFORM_COPY[id].name} text={PLATFORM_COPY[id].line} />
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <Pick sel={p.aiPlatforms} onClick={() => void decide()} title="Let AI decide from my goals" text="We recommend platforms with reasons, based on your goal, topic and audience. You approve before anything is posted." />
      </div>
      {busy && <div className="dk-note" style={{ marginTop: 14 }}><Spinner /> Choosing platforms...</div>}
      {err && <div className="dk-err" role="alert">{err}</div>}
      {p.aiPlatforms && p.platformReasons.length > 0 && (
        <div className="dk-panel" style={{ marginTop: 14 }}>
          {p.platformReasons.map((r) => (
            <div key={r.platform} className="dk-row" style={{ marginBottom: 8 }}>
              <PlatLogo platform={r.platform} />
              <span><b>{PLATFORM_COPY[r.platform].name}</b>: {r.reason}</span>
            </div>
          ))}
          <p style={{ fontSize: 15 }}>Tap a platform above to change this list.</p>
        </div>
      )}
    </>
  );
}

function TimeStep() {
  const { profile: p } = useDesk();
  const toggleTool = (t: string) => {
    if (t === "None yet") return patchProfile({ tools: p.tools.includes(t) ? [] : [t] });
    const base = p.tools.filter((x) => x !== "None yet");
    patchProfile({ tools: base.includes(t) ? base.filter((x) => x !== t) : [...base, t] });
  };
  return (
    <>
      <Head no="05 / Time, tools & style" title="How much time can you give?" intro="Your plan is built to fit this. You set the pace; we size the calendar to match." />
      <div className="dk-g2" style={{ alignItems: "start" }}>
        <div>
          <div className="dk-label">Hours per week {p.hours > 0 && <span className="dk-tag blue" style={{ marginLeft: 8 }}>{hoursLabel(p.hours)}</span>}</div>
          <input className="dk-slider" type="range" min={0} max={10} step={1} value={p.hours} onChange={(e) => patchProfile({ hours: Number(e.target.value) })} aria-label="Hours per week" />
          <div className="dk-scale"><span>1 hour</span><span>5 hours</span><span>10+ hours</span></div>
          <div className="dk-label" style={{ marginTop: 26 }}>What you have</div>
          <div className="dk-chips">{TOOLS.map((t) => <button key={t} type="button" className={`dk-chip${p.tools.includes(t) ? " sel" : ""}`} onClick={() => toggleTool(t)}>{t}</button>)}</div>
        </div>
        <div>
          <div className="dk-label">On camera?</div>
          <div className="dk-chips">{CAMERA.map((t) => <button key={t} type="button" className={`dk-chip${p.camera === t ? " sel" : ""}`} onClick={() => patchProfile({ camera: t })}>{t}</button>)}</div>
          <div className="dk-label" style={{ marginTop: 26 }}>Language & voice</div>
          <div className="dk-chips">{LANGUAGES.map((t) => <button key={t} type="button" className={`dk-chip${p.language === t ? " sel" : ""}`} onClick={() => patchProfile({ language: t })}>{t}</button>)}
            <select className={`dk-chip${p.language && !(LANGUAGES as readonly string[]).includes(p.language) ? " sel" : ""}`} aria-label="Select other language" value={p.language && !(LANGUAGES as readonly string[]).includes(p.language) ? p.language : ""} onChange={(e) => { if (e.target.value) patchProfile({ language: e.target.value }); }}>
              <option value="">Select other</option>
              {OTHER_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="dk-panel" style={{ marginTop: 26 }}>
            <div className="dk-label">Your script style</div>
            <p>{p.language && p.camera ? `Scripts will be written in ${p.language}, for ${p.camera.toLowerCase()}.` : "Pick a language and how you appear. Nothing is pre-set."}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function Done({ go }: { go: (n: number) => void }) {
  const nav = useNavigate();
  const { profile: p } = useDesk();
  const rows: [string, string, number][] = [
    ["Goal", p.goal, 1],
    ["Topic", p.topic, 2],
    ["Audience", [p.audience, p.audienceNotes].filter(Boolean).join(" | "), 3],
    ["Platforms", p.platforms.map((x) => PLATFORM_COPY[x].name).join(", "), 4],
    ["Time", [hoursLabel(p.hours), p.camera].filter(Boolean).join(", "), 5],
    ["Language", p.language, 5],
  ];
  return (
    <SetupFrame
      step={5}
      foot={
        <>
          <span style={{ textAlign: "left" }}>Setup stays saved. This screen shows once.</span>
          <button type="button" className="dk-btn" onClick={() => void nav({ to: "/desk/niche" })}>Build my 30-day plan</button>
        </>
      }
    >
      <div className="dk-eyebrow">You're all set</div>
      <div className="dk-intro">
        <h1>Ready to plan your first month</h1>
        <p>This screen recaps the answers you just gave. Tap any answer to change it before we build your plan.</p>
      </div>
      <div className="dk-recap">
        {rows.map(([k, v, s]) => (
          <button key={k} type="button" onClick={() => go(s)}>
            <small>{k}</small>
            {v || "Not answered"}
          </button>
        ))}
      </div>
      <div className="dk-label" style={{ marginTop: 34 }}>What happens next</div>
      <div className="dk-g3">
        {[["We pick your niche", "AI suggests niches from your answers. You choose."], ["We research it", "Keywords, pain points and reference ideas, labelled as AI estimates or real sources."], ["You get a 30-day calendar", "Ranked topics with reasons, then script, record or generate, edit and post."]].map(([a, b], i) => (
          <div key={a} className="dk-panel"><h3>{i + 1}. {a}</h3><p style={{ marginTop: 8, fontSize: 16 }}>{b}</p></div>
        ))}
      </div>
    </SetupFrame>
  );
}
