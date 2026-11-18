import { describe, expect, it, vi } from "vitest";
vi.mock("@lovable.dev/ai-gateway", () => ({ generateResponse: vi.fn() }));
import { buildResults, extractLinks } from "@/lib/references/search.server";
import { classify, type WebHit } from "@/lib/references/web";

const ok = async (h: WebHit) => ({ ...h, author: "c", thumbnail: null, views: null, likes: null, verified: "platform" as const, note: "" });
const blocked = async (h: WebHit) => ({ ...h, author: "", thumbnail: null, views: null, likes: null, verified: "search-only" as const, note: "blocked" });

describe("reference results", () => {
  it("reads links from search sources, citations and answer text with evidence", () => {
    const links = extractLinks({ output: [
      { type: "web_search_call", action: { sources: [{ type: "url", url: "https://www.linkedin.com/posts/a-activity-1" }] } },
      { type: "message", content: [{ text: "https://www.youtube.com/watch?v=abcdefghijk\nhttps://www.linkedin.com/posts/a-activity-1", annotations: [{ url: "https://www.instagram.com/reel/ABCDE/", title: "Reel" }] }] },
    ] });
    expect(links).toEqual([
      { url: "https://www.linkedin.com/posts/a-activity-1", title: "", evidence: "search" },
      { url: "https://www.instagram.com/reel/ABCDE/", title: "Reel", evidence: "search" },
      { url: "https://www.youtube.com/watch?v=abcdefghijk", title: "", evidence: "text" },
    ]);
  });
  it("rejects profiles, channels, playlists, articles and search pages", () => {
    for (const u of ["https://www.youtube.com/@siteground", "https://www.youtube.com/channel/UC1", "https://www.youtube.com/playlist?list=PL1", "https://www.youtube.com/results?search_query=x", "https://www.instagram.com/someone/", "https://www.linkedin.com/in/someone", "https://www.linkedin.com/pulse/article-x", "https://help.youtube.com/stories/a"]) expect(classify(u)).toBeNull();
    expect(classify("https://youtu.be/abcdefghijk")?.url).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });
  it("keeps blocked search links as not verified instead of erasing them", async () => {
    const r = await buildResults("li", "local business website", [{ url: "https://www.linkedin.com/posts/a-activity-1", title: "Local business website tips", evidence: "search" }], blocked);
    expect(r.status).toBe("unverified");
    expect(r.videos).toHaveLength(0);
    expect(r.unverified).toHaveLength(1);
  });
  it("drops text-only links the platform did not confirm", async () => {
    const r = await buildResults("yt", "x", [{ url: "https://www.youtube.com/watch?v=abcdefghijk", title: "", evidence: "text" }], blocked);
    expect(r.status).toBe("empty");
  });
  it("puts confirmed videos first and sorts by idea relevance", async () => {
    const r = await buildResults("yt", "local business website", [
      { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "Cooking", evidence: "search" },
      { url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", title: "Local business website plan", evidence: "search" },
    ], ok);
    expect(r.videos.map((v) => v.url)).toEqual(["https://www.youtube.com/watch?v=bbbbbbbbbbb", "https://www.youtube.com/watch?v=aaaaaaaaaaa"]);
  });
});
