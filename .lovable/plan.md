# Fix reference video search

Test idea throughout: "How to plan a local business website that invites enquiries".

## What is wrong today
- Search uses the built-in AI's web search tool, but each platform gets one search call limited to one domain. Instagram gets no domain filter. Only citation links are read, so when the AI writes links in its answer text without citing them, the results are empty.
- Verification throws results away. If the YouTube check fails or the page check throws an error, the link is removed even though the search really found it.
- Empty results and "nothing found" are stored as successful results for 6 hours, so "Search again" keeps showing the same empty list.
- The screen can't tell apart "search service failed", "no matching videos" and "found but not verified", so it falls back to sending you to Google.

## What I will build
1. **Check the real search first.** Run the test idea once per platform through the built-in AI web search and save the actual response, to see which links, citations and domains come back. If web search turns out not to be available on the built-in AI, I stop and report that exact blocker instead of faking results.
2. **Better queries.** Turn the idea into 2 or 3 short searches that keep its meaning (for example "local business website enquiries", "plan small business website get leads"), sent in one bounded AI call per platform (at most 3 search steps, no retries).
3. **Read links from real search evidence only.** Collect links from the citations and from the search tool's listed sources. Links that only appear in the AI's own text are kept only if search also returned them. No invented or hard-coded links.
4. **Strict video filter.** Keep only single video pages (YouTube watch/shorts, Instagram reel/p/tv, LinkedIn posts/feed updates/video). Remove profiles, channels, playlists, articles and search pages.
5. **Finding and checking are separate.**
   - Confirmed: the platform itself confirms it (YouTube title/creator/thumbnail, Instagram/LinkedIn page details).
   - "Found in search, video not verified": the platform blocked the check. These stay and are shown in their own group.
   Confirmed videos come first.
6. **Results card.** Shows platform, title, creator and thumbnail when known, the source link and an "Open video" button. Views, likes and dates show only when actually read, otherwise they stay unknown. Sorted by how well they match the idea. No made-up popularity, no "top performing".
7. **Honest caching and Search again.** Only searches that find videos are saved, for a shorter time. Errors and empty results are never saved. "Search again" skips the saved copy and runs one fresh search, which still counts against your hourly limit.
8. **Clear messages.** Search service error / no relevant videos found / found but platform blocked the check. A Google link stays as an optional extra and never counts as a found video.
9. **Kept as is.** Sign-in check, server-only keys, the 100/hour durable limit, no automatic retries, Lovable credits only. X stays labeled as not supported. Your projects, media, editor and design stay untouched. Nothing gets published.

## Tests
Update the reference tests for: reading search responses, the video filter, keeping blocked links as not verified, empty or error results not saved, Search again skipping the saved copy while still counting against the limit, and sign-in plus limit checks running before any search. Old tests that expect blocked links to disappear will be updated to match this behaviour, without weakening any protection.

## Final real check
Sign in, run the test idea for YouTube, Instagram and LinkedIn on the real search (about 3 to 6 searches of credits), list every result link by platform with its label, open a few to confirm where they lead, and report what works and what is still blocked.

## Technical notes
- Files: `src/lib/references/search.server.ts` (discover, parse, cache, `fresh` flag), `web.ts` (`verify` returns search-only on failure instead of null, classify tightened), `contracts.ts` (response shape: `confirmed`, `unverified`, `status: ok|empty|error`), `reference-panel.tsx` (groups, labels, Search again sends `fresh: true`), tests in `src/test/references.test.ts` and `reference-security.test.ts`.
- Discovery reads `url_citation` annotations plus `web_search_call.action.sources` (`include: ["web_search_call.action.sources"]`), with `allowed_domains` per platform (Instagram included if the real response supports it).
