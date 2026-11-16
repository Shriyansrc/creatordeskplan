import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DeskShell } from "@/desk/ui";
import { useDesk } from "@/desk/store";

export const Route = createFileRoute("/desk")({
  head: () => ({ meta: [{ title: "Your desk - Creator Desk" }] }),
  component: DeskLayout,
});

function DeskLayout() {
  const desk = useDesk();
  const nav = useNavigate();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !desk.profile.setupDone) void nav({ to: "/setup", search: { step: 1 }, replace: true });
  }, [mounted, desk.profile.setupDone, nav]);
  if (!mounted || !desk.profile.setupDone) return null;
  return (
    <DeskShell>
      <Outlet />
    </DeskShell>
  );
}
