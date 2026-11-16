import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PlatformMark } from "@/components/creator/platform-mark";
import type { Platform } from "@/lib/ai/contracts";
import "./desk.css";

export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="dk-brand">
      <span className="dk-mark" />
      Creator Desk
    </Link>
  );
}

export function PlatLogo({ platform }: { platform: Platform }) {
  return (
    <span className={`dk-plat ${platform}`}>
      <PlatformMark platform={platform} />
    </span>
  );
}

export function Steps({ step, total = 5 }: { step: number; total?: number }) {
  return (
    <div className="dk-steps" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <b key={i} className={i < step - 1 ? "done" : i === step - 1 ? "current" : ""} />
      ))}
    </div>
  );
}

export function SetupFrame({ step, children, foot }: { step: number; children: ReactNode; foot: ReactNode }) {
  return (
    <div className="desk">
      <header className="dk-top">
        <Brand />
        <Steps step={step} />
        <span className="dk-aside dk-stepn">Step {step} of 5</span>
      </header>
      <main className="dk-main">{children}</main>
      <footer className="dk-foot">{foot}</footer>
    </div>
  );
}

const NAV = [
  ["/desk", "Home"],
  ["/desk/niche", "Niche"],
  ["/desk/plan", "Plan"],
  ["/desk/create", "Create"],
  ["/desk/editor", "Editor"],
  ["/desk/share", "Share"],
] as const;

export function DeskShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname }).replace(/\/$/, "") || "/";
  return (
    <div className="desk">
      <header className="dk-top">
        <Brand to="/desk" />
        <nav className="dk-nav">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} className={path === to ? "on" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="dk-aside">
          <Link to="/desk/settings">Settings</Link>
        </div>
      </header>
      <main className="dk-main">{children}</main>
      <nav className="dk-mobnav">
        {NAV.map(([to, label]) => (
          <Link key={to} to={to} className={path === to ? "on" : ""}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Spinner() {
  return <span className="dk-spin" role="status" aria-label="Working" />;
}
