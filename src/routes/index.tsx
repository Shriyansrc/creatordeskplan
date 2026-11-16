import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { GoogleButton } from "@/components/creator/google-button";
import { useAuth, signOut, displayName } from "@/hooks/use-auth";
import { Brand } from "@/desk/ui";
import { useDesk } from "@/desk/store";
import "@/desk/desk.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Creator Desk" },
      { name: "description", content: "Plan, script and edit your videos in one workspace." },
      { property: "og:title", content: "Creator Desk" },
      { property: "og:description", content: "Plan, script and edit your videos in one workspace." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const desk = useDesk();
  const nav = useNavigate();
  const { user } = useAuth();
  useEffect(() => {
    if (desk.profile.setupDone) void nav({ to: "/desk", replace: true });
  }, [desk.profile.setupDone, nav]);
  return (
    <div className="desk">
      <header className="dk-top">
        <Brand />
        <span className="dk-aside">
          {user ? (
            <>
              <span>{displayName(user)}</span>
              <button type="button" onClick={() => void signOut()}>Sign out</button>
            </>
          ) : (
            <Link to="/setup" search={{ step: 1 }}>First-time setup</Link>
          )}
        </span>
      </header>
      <main className="dk-main">
        <div className="dk-hero">
          <div>
            <div className="dk-eyebrow">Welcome to Creator Desk</div>
            <h1>Plan, script and edit your videos</h1>
            <p style={{ fontSize: 21, margin: "26px 0 20px", maxWidth: 520 }}>
              One workspace: a 30-day plan, scripts, recording help, the editor and posting. Everything is built from your answers. Nothing is prefilled for you.
            </p>
            <div className="dk-note" style={{ display: "inline-block" }}>About 2 minutes to set up. Change any answer later.</div>
            <div className="dk-row" style={{ marginTop: 28 }}>
              <Link to="/setup" search={{ step: 1 }} className="dk-btn">Start setup</Link>
              {!user && <GoogleButton />}
            </div>
            <p style={{ fontSize: 15, marginTop: 14 }}>
              Signing in is optional. Your plans stay in this browser until you save them to your account in Settings.
            </p>
          </div>
          <div className="dk-cards" aria-hidden="true">
            <div className="c1"><small>YOUR NEXT IDEA</small>Choose a video topic.</div>
            <div className="c2">Pick where you post.</div>
            <div className="c3"><small>FROM IDEA TO VIDEO</small>Your plan, your words.</div>
          </div>
        </div>
      </main>
    </div>
  );
}
