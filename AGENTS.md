<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Creator Desk architecture

- AI tasks use typed contracts in `src/lib/ai/` and same-origin TanStack server routes; the built-in Lovable AI is the default and an own AI_PROVIDER key overrides it; browser code never reads credentials, because credentials must remain server-only.
- Browser media editing and export live in `src/lib/editor/` and lazy-load FFmpeg/Whisper only after user action, because the Cloudflare Worker must not bundle or execute browser media engines.
- Editor preview and export use the same canvas renderer; editor-local operation contracts extend the AI whitelist for local-only edits, because timing and visual effects must agree without changing other AI tasks.
- Editor captions and soundtracks use pure timeline cues; browser Web Audio prepares the same deterministic voice/SFX/music buffers for playback and export, and local fisheye uses WebGL with a CPU mesh fallback, because effects must never require a server or credits.
- Session `File`/`Blob` objects use the in-memory editor store while durable planning and edit decisions use the `cd:` storage prefix, because binary media must not be written to localStorage.
- Generation and retrieval providers (YouTube, voice, video) are reached only through `/api/ai/*` server routes with zod-validated responses, and media jobs are stateless provider-id polling, because Workers keep no job memory between requests.
- Reel jobs go through the `ReelJobService` interface in `src/lib/reel-jobs/` (local fallback, remote when a backend exists), so syncing can be added without changing callers.
- Sign-in is optional Google auth via `src/hooks/use-auth.ts` (Lovable Cloud broker); no route is gated, because the studio must keep working signed out.
- Reference discovery authenticates every request with backend auth.getUser before reading caches; a service-role-only atomic rolling-hour reservation RPC runs before inference, because quotas must survive instances and fail closed without affecting local studio access.
- Script output passes through `src/lib/ai/script-style.ts` (shared voice rules + dash removal), because owner script rules must hold even when the model slips.
- Reference-video analysis lives in `src/lib/reference-analysis/` behind `/api/ai/reference-video`: gateway video input follows auth + durable quota; uploads are size/MIME bounded and not saved by the app (provider retention is unverified), because unsupported duration/retention promises must not be made.
- Reference outcomes are input-local with request-version guards; `src/desk/reference-drafts.ts` appends UUID-keyed drafts with topic titles and labels, retaining legacy keys, because changed inputs must not revive stale results or overwrite any saved draft.
