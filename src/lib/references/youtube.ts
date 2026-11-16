import { rankCandidates, referencesResultSchema, ytSearchSchema, ytVideosSchema, type ReferencesInput, type ReferencesResult } from "./contracts";

const API = "https://www.googleapis.com/youtube/v3";

export async function searchYouTube(apiKey: string, input: ReferencesInput): Promise<ReferencesResult> {
  const count = input.count ?? 8;
  const query = [input.idea, input.niche].filter(Boolean).join(" ").slice(0, 200);
  const searchUrl = `${API}/search?${new URLSearchParams({ part: "snippet", type: "video", maxResults: "25", order: "relevance", q: query, key: apiKey })}`;
  const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(20_000) });
  if (!searchResponse.ok) throw new Error(`YouTube search failed with HTTP ${searchResponse.status}`);
  const search = ytSearchSchema.parse(await searchResponse.json());
  const ids = search.items.map((item) => item.id.videoId);
  if (!ids.length) return { source: "YouTube Data API v3", videos: [] };
  const videosUrl = `${API}/videos?${new URLSearchParams({ part: "snippet,statistics", id: ids.join(","), key: apiKey })}`;
  const videosResponse = await fetch(videosUrl, { signal: AbortSignal.timeout(20_000) });
  if (!videosResponse.ok) throw new Error(`YouTube video lookup failed with HTTP ${videosResponse.status}`);
  const videos = ytVideosSchema.parse(await videosResponse.json());
  const candidates = videos.items.map((video) => ({
    id: video.id,
    title: video.snippet.title,
    description: video.snippet.description,
    channel: video.snippet.channelTitle,
    publishedAt: video.snippet.publishedAt,
    thumbnail: (video.snippet.thumbnails["high"] ?? video.snippet.thumbnails["medium"] ?? Object.values(video.snippet.thumbnails)[0])?.url ?? "",
    viewCount: Number(video.statistics.viewCount ?? 0),
    searchOrder: ids.indexOf(video.id),
  }));
  const ranked = rankCandidates(candidates.filter((c) => c.thumbnail), input.idea).slice(0, count);
  return referencesResultSchema.parse({
    source: "YouTube Data API v3",
    videos: ranked.map(({ item, why }) => ({ id: item.id, title: item.title.slice(0, 300), channel: item.channel.slice(0, 200), url: `https://www.youtube.com/watch?v=${item.id}`, thumbnail: item.thumbnail, publishedAt: item.publishedAt, viewCount: item.viewCount, why })),
  });
}
