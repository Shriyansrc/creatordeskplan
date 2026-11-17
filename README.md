# Creator Desk

Creator Desk is a content-planning and browser-video-editing app. It brings research, plans, scripts, recording/import, editing, local exports and manual sharing into one workspace.

Built with TanStack Start, React, TypeScript, Vite and Tailwind CSS. The app uses Supabase authentication and account-state storage, with server-side AI routes and Lovable AI Gateway support.

## Run locally

```sh
bun install
bun run dev
```

Other package scripts:

```sh
bun run build
bun run preview
bun run lint
bun run test
```

The development and build scripts prepare local subject-segmentation assets first. A fresh checkout is not a fully configured hosted service: authentication, database permissions, AI credentials and network access must be configured for the features that need them. Running these commands is not evidence that every feature has passed testing.

## Configuration

Keep private credentials in the server environment, never in source, browser storage or `VITE_` variables.

- Supabase browser configuration: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Supabase server configuration: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Server authorization, quotas and database operations also depend on the configured backend and its policies.
- Built-in AI generation uses the server-side `LOVABLE_API_KEY`. The provider layer also supports an external provider through `AI_PROVIDER`, `AI_API_KEY` and `AI_MODEL`.
- Optional media-provider routes use `VOICE_PROVIDER` / `VOICE_API_KEY` and `VIDEO_PROVIDER` / `VIDEO_API_KEY`.
- The legacy AI status route checks `YOUTUBE_API_KEY` for its references flag. That flag is not a complete health check for every research/reference path.

A Supabase publishable key is client configuration, not a service-role credential. Never expose a service-role key, provider key, database credential or signing secret. Do not assume the checked-in environment configuration grants access to a working backend for another deployment.

## Planning and research

The workspace includes audience/niche research, content plans, scripts and reference workflows. AI requests run through server routes with input/output validation and authentication/quota checks.

Research should be read with its cited sources and limitations. Search relevance is not a ranking of top-performing videos. AI-estimated topic scores are not measured platform analytics, and the app does not establish that generated copy or a suggested idea will perform well. Source availability and provider configuration can change.

## Editing, storage and export

The browser editor includes clip import/recording, timeline editing, captions and local rendering. Local Whisper transcription is separate from the server AI speech-generation route. Transcription and media-processing assets may need to download on first use; this is not a promise of a fully offline app.

- Planning and edit metadata use browser-local state. Signed-in account-state sync is implemented separately through the `creator_state` table.
- Imported/recorded clips and saved exports use the browser's IndexedDB library. They are local to that browser and site origin, not uploaded video backups or cross-device cloud storage.
- Storage can be blocked, full, cleared or evicted. Download important originals and exports. Files saved on a preview origin do not automatically appear on a custom domain.
- The current source includes restoration of stored clips and a Your Videos library for saved exports. Missing local files still require the original clip to be imported again.
- Rendering/export runs in the browser. WebM uses browser media APIs; MP4 conversion uses FFmpeg WebAssembly where supported. Device resources and browser support affect export reliability.

Source implementation does not mean every path has been verified on every device or on the currently published website.

## Sharing is manual

Nothing is automatically posted to social accounts. The Share page offers the current session's exported video, copyable script/caption content and links to platform upload/composer pages. Captions on that page come from a script in the plan. Saved exports can be recovered through Your Videos in the same browser when local storage is available.

## Motion/reel jobs

The repository contains motion/reel-job designs, schema drafts and local workflow code. These are not proof of a provisioned production render queue, connected remote worker, cloud video retention or unattended video generation. See `docs/reel-jobs.md` and the related schema/code before changing this area. Apply and verify infrastructure deliberately; a schema file being present does not mean it was applied.

## Deployment and verification

GitHub source, Lovable preview and the published custom domain are separate states. A commit or working preview is not confirmation that the same update is live on the custom domain. Publishing the website is a separate action from changing repository visibility.

Before a demo, test the intended deployment with a short clip: sign in as needed, open a plan, import/record, transcribe, edit, save/export, open Share, download and play the result. Also test recovery after a reload in the same browser. Use an internet connection for backend features and any first-use asset downloads. Keep a downloaded demo backup.

## Third-party assets

This repository includes third-party packages, fonts and media. Their presence does not grant permission to redistribute or reuse them. Check each asset's own licence and provenance before copying, publishing or relicensing it. No blanket open-source licence is granted here for bundled fonts or media.
