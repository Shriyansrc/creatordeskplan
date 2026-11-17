import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { VideoEditor } from "@/components/creator/video-editor";
import { useDesk } from "@/desk/store";
import type { StudioShared } from "@/lib/creator-shared";

export const Route = createFileRoute("/desk/editor")({ component: Editor });

function Editor() {
  const d = useDesk();
  const nav = useNavigate();
  const [st, setSt] = useState<StudioShared>({
    topic: d.profile.topic, goal: d.profile.goal, niche: -1, mode: "choose",
    plats: Object.fromEntries(d.profile.platforms.map((p) => [p, true])),
    day: 1, section: "hook", caption: "owner", emph: "", size: 60, ratio: "9:16", tool: "Media", pub: "", when: "",
  });
  return <div className="old-ed"><VideoEditor st={st} set={(patch) => setSt((s) => ({ ...s, ...patch }))} go={() => void nav({ to: "/desk/share" })} /></div>;
}

