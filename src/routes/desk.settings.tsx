import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GoogleButton } from "@/components/creator/google-button";
import { useAuth, signOut, displayName } from "@/hooks/use-auth";
import { SyncPanel } from "@/desk/extras";
import { PlatLogo } from "@/desk/ui";
import { PLATFORM_COPY, hoursLabel, resetDesk, useDesk } from "@/desk/store";
import { ALL_PLATFORMS } from "@/lib/creator-shared";

export const Route = createFileRoute("/desk/settings")({ component: Settings });

function Settings() {
  const d = useDesk();
  const p = d.profile;
  const { user } = useAuth();
  const nav = useNavigate();
  const rows: [string, string, number][] = [
    ["Goal", p.goal, 1],
    ["Topic", p.topic, 2],
    ["Audience", p.audience || p.audienceNotes, 3],
    ["Platforms", p.platforms.map((x) => PLATFORM_COPY[x].name).join(", "), 4],
    ["Time", [hoursLabel(p.hours), p.camera].filter(Boolean).join(", "), 5],
    ["Language", p.language, 5],
  ];
  const exportData = () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "creator-desk-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <h1>Settings</h1>
      <p style={{ fontSize: 20, margin: "10px 0 24px" }}>Your account and your answers, editable without redoing setup.</p>
      <div className="dk-g2" style={{ gap: 22, alignItems: "start" }}>
        <div className="dk-panel">
          <div className="dk-label">Account</div>
          {user ? (
            <>
              <h3>Signed in</h3>
              <p style={{ margin: "6px 0 14px" }}>{displayName(user)}. Save your plans to your account to open them on another device.</p>
              <SyncPanel userId={user.id} />
              <button type="button" className="dk-btn secondary" style={{ marginTop: 14 }} onClick={() => void signOut()}>Sign out</button>
            </>
          ) : (
            <>
              <h3>Not signed in</h3>
              <p style={{ margin: "6px 0 14px" }}>Signing in is optional. Sign in to save your plans to your account and open them on another device.</p>
              <GoogleButton label="Sign in with Google" />
            </>
          )}
        </div>
        <div className="dk-panel">
          <div className="dk-label">Your setup answers</div>
          {rows.map(([k, v, s]) => (
            <div key={k} className="dk-row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
              <span>{k}</span>
              <Link to="/setup" search={{ step: s }} style={{ color: v ? "var(--ink)" : "#8fa0b5", textDecoration: "none", textAlign: "right" }}>{v || "not set yet"}</Link>
            </div>
          ))}
        </div>
        <div className="dk-panel">
          <div className="dk-label">Connected platforms</div>
          <div className="dk-row">{ALL_PLATFORMS.map((x) => <PlatLogo key={x} platform={x} />)}<span style={{ fontSize: 15 }}>None connected. You post each video yourself.</span></div>
        </div>
        <div className="dk-panel">
          <div className="dk-label">Work</div>
          <div className="dk-row" style={{ justifyContent: "space-between", padding: "6px 0" }}><span>Download all my data</span><button type="button" className="dk-link" onClick={exportData}>Export</button></div>
          <div className="dk-row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
            <span>Delete my data in this browser</span>
            <button type="button" className="dk-link" style={{ color: "var(--pink)" }} onClick={() => { if (window.confirm("Delete all plans and answers saved in this browser?")) { resetDesk(); void nav({ to: "/" }); } }}>Delete</button>
          </div>
        </div>
      </div>
    </>
  );
}
