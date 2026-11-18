# Reference analysis corrections and recovered evidence

## Corrections
- Analysis is session/input-local, cleared on link/file change, Analyse start, and failure. A request-version guard ignores an older request completing after an input change.
- Each explicit reference-script request appends a UUID-keyed draft. Existing main scripts and legacy `topic@ref` entries are retained. Plan displays all reference drafts; Create/Share give them numbered topic labels.
- Removed the unenforced three-minute promise and browser-only duration check. Uploads are bounded by 15 × 1024 × 1024 bytes, supported MIME and video signature before quota/inference. Longer videos may be rejected by the provider.
- Platform access statements describe this configured flow, not universal platform restrictions. Creator Desk does not save uploads; provider retention is unverified.
- Invalid JSON/schema errors make no claim that the model watched or heard media.
- Authentication, durable quota, model selections, retries, discovery, editor, saved media and account data are unchanged. Nothing published; no new inference, TTS, account sign-in, services or top-ups.

## Recovered real requests (earlier run, not new tests)
Source: retained project Gateway logs and previous chat. Request payloads are redacted/truncated. Temporary original media, browser recordings and construction script were not retained, so no new independent playback comparison was possible.

### Uploaded test clip
- Name: `clip.mp4`, recovered from the earlier real script request's reference source and previous UI report.
- Origin: previous chat states the assistant made a test clip, orange background and a blue square, with generated speech. The real TTS request confirms the speech source below. Exact construction command is unavailable.
- Duration: previous chat called it ten seconds; model outputs say 10 seconds. The retained inline MP4 `mvhd` header gives **10.52 seconds** (not a fresh playback measurement).
- Actual intended spoken text confirmed by TTS request `01a1ecb6-3628-73c3-bb16-acd0cbbee2ce`: “Three tips for a bakery website. First, put your phone number at the top. Second, show real photos of your bread.” This contains only two delivered tips despite its opening promise of three.
- Visual details recorded in previous chat: orange background, blue square, `BAKERY TIPS`, then `CALL 555 0199` at about five seconds. These also occur in the model response; independent original-frame evidence is unavailable now.
- Probe `01a1ecb6-71f5-7ecb-8756-75b86fec5074`, 03:32:29 UTC: `google/gemini-3.8-flash`, `video_url` with inline `data:video/mp4;base64,…`, HTTP/upstream 200. 726 video and 263 audio input tokens; 1,021 total input / 500 output. Output quotes the exact speech and identifies orange background, blue square, both text cards and their approximate timing.
- Analysis `01a1ecbb-0696-7e33-9350-a07c1f317ec8`, 03:37:32 UTC: same model/input mode, HTTP/upstream 200; 726 video / 263 audio tokens, 1,340 total input / 609 output. Output: `canSee:true`, `speechHeard:true`; “Place contact phone number at top of page”, “Feature authentic product photography”; text at 0:00 and 0:05. This answer included an unsupported result-promising idea title; the subsequent prompt correction was tested separately.
- Later analysis `01a1ecbd-c9aa-7c43-aa58-cbb2e63b4a27`, 03:40:34 UTC: same model/inline video input; HTTP/upstream 200; 726 video / 263 audio, 1,364 input / 1,401 output. Output has empty fit caution and titles “Three Header Tweaks for Service Sites”, “Planning Local Business Homepages”, “Simple Website Checklist for Trades”.

### YouTube URL
- Earlier chat identifies `https://www.youtube.com/watch?v=jNQXAC9IVRw`, “Me at the zoo”, about 19 seconds. Gateway redaction removes the query, so the exact video ID is corroborated by chat, not the retained request alone.
- Request `01a1ecba-95c0-7d83-969e-0888a711a13a`, 03:37:04 UTC: `google/gemini-3.8-flash`, actual `video_url` YouTube transport, HTTP/upstream 200, 1,197 video / 479 audio tokens, 2,021 input / 1,041 output.
- Output: “A person stands in front of an elephant enclosure and says, 'All right, so here we are in front of the elephants.'”; really long trunks; single handheld take with no cuts/captions; 19 seconds. Video+audio input support is evidenced by token usage plus matching content, not by a plain URL in text.
- The previous chat records views unreadable/unknown. Current recovery did not fetch YouTube or metrics again.

### Real adapted-script request
- Request `01a1ecbb-3066-7b9c-b0fd-8a803370a4c9`, 03:37:42 UTC: `openai/gpt-6.1-terra`, HTTP/upstream 200, 2,242 input / 662 output tokens.
- Actual `input.reference`: source `Uploaded clip clip.mp4`; mode `video+audio`; hookPattern `State a specific number of actionable tips tailored to a single local niche.`; beats `State niche and topic promise`, `Deliver first high-impact contact tweak`, `Deliver second visual trust element`; visualPatterns `Static minimalist slides with flat background color, geometric shape placeholder, and high-contrast typography.`; pacing `Slow, steady robotic narration with minimal visual cuts.`; idea `3 Header Tweaks That Double Calls: Focusing on above-the-fold contact visibility for trades.`
- Other actual input: English, Get enquiries, Local owners, Local business websites, YouTube, topic “How to plan a local business website that invites enquiries”. This proves reference data reached a real model request; it does not prove every saved-plan context was tested.
- Actual output hook: “If you run a plumbing business, try these two header tweaks on your local business website to make it easier for visitors to get in touch.”
- Actual solution: “First, put your phone number at the top and make it tap to call, so people on a phone do not have to copy it. Then add a real photo of your team or your work, so visitors can see who is behind the business.” Output did not repeat the supplied doubling promise.

## Corrections verification (no new paid calls)
- Full regression run: **131 passed, 4 skipped, 1 failed**. Only failure is the previously reported unrelated `src/lib/reel-jobs/api.test.ts:30` upload fixture (`files` map empty); not altered by this correction.
- Reference regression subset: 34 tests passed, including input-local outcomes, ignoring late responses, 15 MB rejection before quota/inference and unique appended drafts.
- Automatic preview build log: `build OK` at 04:01:21 UTC.
- Playwright replay: all `/api/ai/*` requests intercepted. Browser-only auth-header stub used; no real account/session/sign-in. Isolated synthetic local profile/plan, actual retained analysis/script responses replayed. Two explicit script clicks preserved main + legacy + two UUID drafts; Create/Share offered all four. Link change, Analyse start and failed new request removed old analysis. Desktop 1280×1800 and phone 390×844 checked. This is a replay UI test, **not** fresh authenticated/inference end-to-end verification.
- Earlier 03:30–03:45 Gateway window contains 11 successful requests: 9 Gemini video calls, 1 TTS and 1 script, totaling **0.191844 Lovable credits**. These are previous-run costs; this correction made zero paid inference requests. Current credit balance unverified.

## Remaining limitations
Provider retention unverified; no server-enforced duration cap (promise removed); Instagram/LinkedIn/X link reading unavailable in this configured flow; original test clip/creation script not retained beyond truncated Gateway payload; prior fresh UI-versus-replay claims are limited to the records above; unrelated reel-job regression failure remains.