import { createFileRoute, Link } from "@tanstack/react-router";
import { useDesk } from "@/desk/store";

export const Route = createFileRoute("/desk/")({ component: Home });

function Home() {
  const d = useDesk();
  const step = !d.niche ? { to: "/desk/niche", title: "Choose your niche", text: "AI suggests niches from your topic and audience. You pick one.", cta: "Find my niche" } : !d.plan ? { to: "/desk/plan", title: "Build your first 30-day plan", text: "Research, ranked topics and a calendar that fits the time you told us you have.", cta: "Build my first plan" } : { to: "/desk/plan", title: "Open your plan", text: "Your ranked topics and calendar are ready.", cta: "Open plan" };
  return (
    <>
      <h1>Welcome to your desk</h1>
      <p style={{ fontSize: 21, margin: "10px 0 24px" }}>{d.plan ? "Your plan is your daily starting point." : "No plan yet. Build your first one and this page becomes your daily starting point."}</p>
      <div className="dk-g2" style={{ gridTemplateColumns: "1.1fr 1fr", alignItems: "stretch" }}>
        <div className="dk-choice" style={{ cursor: "default" }}>
          <div className="dk-label">Next up</div>
          <h2>{step.title}</h2>
          <p style={{ margin: "12px 0 22px" }}>{step.text}</p>
          <Link to={step.to} className="dk-btn">{step.cta}</Link>
        </div>
        <div className="dk-panel">
          <div className="dk-label">Your week</div>
          <div className="dk-week">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <div key={x}>{x}<i /></div>)}</div>
          <p style={{ fontSize: 15 }}>Recording, editing and posting days appear here once your plan exists.</p>
        </div>
      </div>
      <div className="dk-label" style={{ marginTop: 34 }}>Your videos</div>
      <div className="dk-empty">Videos you script, record, drop in or edit appear here.<br />Nothing is pre-made for you.</div>
    </>
  );
}
