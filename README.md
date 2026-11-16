# Creator Desk

Creator Desk is a mobile-first content studio for planning, scripting, editing and manually publishing short videos. The existing Silver Lens interface runs as a TanStack Start application with React, TypeScript and Tailwind CSS.

## Development

```sh
bun install
bun run dev
```

## AI provider configuration

AI calls use the existing TanStack Start server routes. No Lovable Cloud, database, authentication service, storage service or AI gateway is required or enabled.

The owner must set these three server environment variables outside the app:

- `AI_PROVIDER` — `openai`, `openrouter`, `anthropic`, `gemini`, or a complete OpenAI-compatible chat-completions endpoint URL.
- `AI_API_KEY` — the provider credential. It is read only inside server request handlers and is never sent to the browser.
- `AI_MODEL` — the provider's model identifier.

Do not prefix these variables with `VITE_`. Do not put their values in source, browser storage or the repository. Preview uses newly configured variables immediately; publish again before expecting a server-environment change in the published app.

When any variable is absent, every `/api/ai/*` task route returns HTTP 503 with:

```json
{"connected":false,"reason":"AI provider not configured"}
```

The available routes are `/api/ai/status`, `/research`, `/plan`, `/script`, `/platforms`, `/edit`, and `/captions`. Request and provider response payloads are validated with zod. There are no automatic retries.

## Local editing and export

Clip files remain session-only browser objects. Edit decisions, transcripts, planning outputs and export metadata use the existing `cd:` localStorage prefix. Original media is never overwritten.

The editor supports non-destructive multi-clip trim, split, delete, reorder, speed, volume, crop, color, silence removal, local Whisper transcription, timed captions, text overlays, zoom punch-ins, undo and redo. Basic prompt parsing runs in the browser. AI prompt editing uses the same validated operation whitelist and remains unavailable until configured.

WebM export renders a new file locally with canvas and MediaRecorder. MP4 export converts that local render with lazy-loaded FFmpeg WebAssembly; its first use downloads the npm-provided FFmpeg core from the app's own static files. Whisper's first use downloads model files from Hugging Face. These downloads require network access but no API key or paid service.

## Honest publishing

Direct posting is not connected. Publishing provides the exported video download, editable/copyable captions and real X or LinkedIn composer links where available. Instagram and YouTube show manual upload steps. No UI reports a successful post.

See `roadmap.md` for the current implementation checklist.

## Reference search, voice and video generation

Server-only environment variables (never `VITE_`, never in the repo or browser):

- `YOUTUBE_API_KEY` — YouTube Data API v3 key. Powers `/api/ai/references` and is required by `/api/ai/research` so research is grounded in real search results. Without it both return 503 Not connected. Instagram and X are never searched or scraped; the app offers link mode with numbers entered by you.
- `VOICE_PROVIDER`, `VOICE_API_KEY` — `replicate:<owner>/<model>` and the Replicate token. The model must accept `text`, `voice`, `speed`, `language`.
- `VIDEO_PROVIDER`, `VIDEO_API_KEY` — `replicate:<owner>/<model>` and the token. The model must accept `prompt`, `aspect_ratio`, `duration`, optional `image`.

`/api/ai/voice` and `/api/ai/video`: POST starts a job, GET `?id=` polls (`queued|running|done|failed|canceled`), GET `?id=&media=1` streams the finished file, DELETE `?id=` cancels. Jobs bill the provider account and only start on an explicit click. Generated media lives in browser memory and is lost on refresh unless downloaded.

## Reel jobs

Target design and worker API: `docs/reel-jobs.md`; schema for later: `docs/reel-jobs.sql` (not applied). The service is not connected, so requests are saved on this device only.
