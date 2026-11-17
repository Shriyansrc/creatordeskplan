import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Spinner } from "@/desk/ui";
import { patchDesk, useDesk } from "@/desk/store";
import { errorText, suggestNiches } from "@/desk/api";

export const Route = createFileRoute("/desk/niche")({ component: Niche });

const REFINE = ["More specific", "For beginners", "In my language", "Less competitive", "Add my style"];

function Niche() {
  const d = useDesk();
  const p = d.profile;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [refine, setRefine] = useState<string[]>([]);
  const aud = [p.audience, p.audienceNotes].filter(Boolean).join(" | ");
  const key = `${p.topic}||${aud}||${p.goal}||${p.language}`;
  const run = async (r: string[]) => {
    setBusy(true);
    setErr("");
    try {
      const extra = r.length ? `${p.goal}. Refine: ${r.join(", ").toLowerCase()}. Language: ${p.language}` : `${p.goal}. Language: ${p.language}`;
      const res = await suggestNiches(p.topic, aud, extra.slice(0, 300));
      patchDesk({ niches: { key, items: res.niches } });
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  const items = d.niches?.key === key ? d.niches.items : [];
  const toggle = (x: string) => {
    const n = refine.includes(x) ? refine.filter((y) => y !== x) : [...refine, x];
    setRefine(n);
    if (items.length) void run(n);
  };
  return (
    <>
      <div className="dk-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Sharpen your niche</h1>
          <p style={{ fontSize: 20, margin: "10px 0 18px", maxWidth: 640 }}>A niche makes your plan specific. Generate ideas from your topic, then refine until one sounds like you.</p>
        </div>
        <button type="button" className="dk-btn" disabled={busy} onClick={() => void run(refine)}>{busy ? <Spinner /> : null}{items.length ? "Regenerate" : "Generate niche ideas"}</button>
      </div>
      <div className="dk-row" style={{ marginBottom: 18 }}>
        <span className="dk-label" style={{ margin: 0 }}>Refine after generating:</span>
        {REFINE.map((x) => <button key={x} type="button" className={`dk-chip${refine.includes(x) ? " sel" : ""}`} onClick={() => toggle(x)}>{x}</button>)}
      </div>
      {err && <div className="dk-err" role="alert">{err}</div>}
      {items.length === 0 && !busy && <div className="dk-empty" style={{ padding: "70px 26px" }}><b>Niche suggestions appear here</b>Each one shows its angle and why it could work for your audience. Suggestions, not promises. You pick, edit or regenerate. Nothing is chosen for you.</div>}
      {busy && items.length === 0 && <div className="dk-empty" style={{ padding: "70px 26px" }}><Spinner /> Generating niches from "{p.topic}"...</div>}
      <div className="dk-g2" style={{ gap: 16 }}>
        {items.map((n) => (
          <button key={n.title} type="button" className={`dk-choice${d.niche?.title === n.title ? " sel" : ""}`} onClick={() => patchDesk({ niche: { title: n.title, fit: n.fit } })} aria-pressed={d.niche?.title === n.title}>
            <span className="sw" />
            <h3>{n.title}</h3>
            <p>{n.fit}</p>
            <div className="mini"><span className="dk-tag est">AI SUGGESTION</span></div>
          </button>
        ))}
      </div>
      {d.niche && (
        <div className="dk-row" style={{ marginTop: 22 }}>
          <input className="dk-field" style={{ maxWidth: 560 }} value={d.niche.title} onChange={(e) => patchDesk({ niche: { title: e.target.value, fit: d.niche?.fit ?? "" } })} aria-label="Edit your niche" />
          <Link to="/desk/plan" className="dk-btn">Use this niche: research and plan</Link>
        </div>
      )}
      <div className="dk-note" style={{ marginTop: 22 }}><b>Tested against reality:</b> your niche is checked against real results in Performance, and you can change it anytime.</div>
    </>
  );
}
