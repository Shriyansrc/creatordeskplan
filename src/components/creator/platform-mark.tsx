import type { Platform } from "@/lib/ai/contracts";
import { PLATFORM_NAMES } from "@/lib/creator-shared";

const PATHS: Record<Platform, string> = {
  ig: "M7.03 1.08C4.19 1.21 2.81 2.11 1.53 3.8.25 5.49.03 7.13.03 12s.22 6.51 1.5 8.2c1.28 1.69 2.66 2.59 5.5 2.72 2.84.14 11.78.14 14.62 0 2.84-.13 4.22-1.03 5.5-2.72 1.28-1.69 1.5-3.33 1.5-8.2s-.22-6.51-1.5-8.2C25.37 2.11 23.49 1.21 20.65 1.08 17.81.94 8.87.94 7.03 1.08ZM12 5.84a6.17 6.17 0 1 1 0 12.34 6.17 6.17 0 0 1 0-12.34Zm0 2a4.17 4.17 0 1 0 0 8.34 4.17 4.17 0 0 0 0-8.34Zm6.4-3.68a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z",
  yt: "M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.87.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z",
  li: "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm1.78 13.02H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z",
  x: "M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.59-6.64 7.59H.47l8.6-9.83L0 1.15h7.6l5.24 6.94 6.06-6.94Zm-1.3 19.5h2.04L6.49 3.24H4.3L17.6 20.65Z",
};

export function PlatformMark({ platform }: { platform: Platform }) {
  return (
    <span className={`plat ${platform}`} role="img" aria-label={PLATFORM_NAMES[platform]}>
      <svg viewBox="0 0 24 24" width="60%" height="60%" fill="currentColor" aria-hidden="true">
        {platform === "ig" ? <><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.4" cy="6.7" r="1.2" /></> : <path d={PATHS[platform]} />}
      </svg>
    </span>
  );
}
