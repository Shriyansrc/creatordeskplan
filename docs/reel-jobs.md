# Reel jobs: target design

Status in this project: **not connected**. Accounts, database and storage are not enabled, so `RemoteReelJobService` is unavailable and the app uses `LocalReelJobService` (device only). Nothing here is provisioned. The worker is not running and nothing in this app starts it.

## Flow
1. User opens "Generate a motion graphic reel for this video instead" (Editor or Publish).
2. Brief + source video are submitted for the signed-in account (`status = submitted`).
3. A person outside the app, via the worker, claims the job, produces the reel in the user's saved motion, font, music and sound-effect styles, uploads the result, marks it `ready` or `failed`.
4. Account > Reel jobs lists jobs on open and every `REEL_JOB_POLL_SECONDS` (one constant in `src/lib/reel-jobs/service.ts`).

## Statuses
`submitted`, `claimed`, `in_progress`, `ready`, `failed`, `canceled`. The device-only fallback uses `saved_on_device` and the UI never shows claimed, in progress or ready unless the real service reported it.

## Data
- Tables `reel_jobs` and `reel_job_events`, scoped by `user_id` with row-level security. SQL: `docs/reel-jobs.sql` (do not apply until the backend is intentionally enabled).
- Private buckets `reel-sources` and `reel-results`, folders `<user_id>/<job_id>/...`, signed URLs valid 10 minutes. Source size limit: 200 MB (shown in the UI).
- Minimization: only brief fields (topic, script, platform, lengthSeconds, notes, videoSource) and attached files. No passwords, tokens or contact details. No cross-user reads. Nothing auto-published, nothing sent to a third party, no charge.

## Client API (account-scoped, bearer = user session token)
| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/reel-jobs` | multipart: `brief` (JSON ReelBrief), `source` (video file, optional) | `ReelJob` |
| GET | `/reel-jobs` | – | `ReelJob[]` (own rows only) |
| GET | `/reel-jobs/:id` | – | `ReelJob` |
| POST | `/reel-jobs/:id/cancel` | – | `ReelJob` (only from `submitted`) |
| GET | `/reel-jobs/:id/download` | – | `{ "url": "<signed url, 10 min>" }` (only when `ready`) |

```ts
ReelBrief = { topic: string; script: string; platform: "ig"|"yt"|"li"|"x"; lengthSeconds: number; notes: string; videoSource: "timeline"|"upload" }
ReelJob   = { id: string; status: Status; brief: ReelBrief; sourceFile: {name,size,type}|null; createdAt: string; error: string|null; where: "remote" }
```

## Worker API (documented only; separate service)
The worker authenticates with its own server credential held outside the app, never in the browser and never shipped to users.

**Pickup cadence: the worker checks for new submitted jobs every 2 minutes (120 seconds).**

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/worker/reel-jobs/claim` | `{ "workerId": string }` | `200 { job: ReelJob, sourceUrl: string \| null }` or `204` when none. Atomic: `update ... set status='claimed', claimed_at=now(), claimed_by=$1 where id = (select id from reel_jobs where status='submitted' order by created_at for update skip locked limit 1) returning *` |
| POST | `/worker/reel-jobs/:id/heartbeat` | `{ "workerId": string, "status": "in_progress", "note"?: string }` | `{ ok: true }` |
| POST | `/worker/reel-jobs/:id/result-upload` | `{ "workerId": string, "contentType": "video/mp4", "size": number }` | `{ uploadUrl: string, path: string }` (signed upload into `reel-results/<user_id>/<id>/`) |
| POST | `/worker/reel-jobs/:id/complete` | `{ "workerId": string, "status": "ready", "resultPath": string }` or `{ "workerId": string, "status": "failed", "error": string }` | `ReelJob` |

Every status change also inserts a `reel_job_events` row `(job_id, at, status, note)`.
