import type { NewsItem } from "./types";
import { yahooNews, yahooQuote } from "./yahoo";

// Headlines for an asset. Yahoo covers US listings well but has almost
// nothing under the BVC symbols, so Colombian shares search Google News in
// Spanish by company name (free RSS feed, no key).

const GOOGLE_NEWS_URL = "https://news.google.com/rss/search";

/** "Grupo Energía Bogotá S.A. E.S.P." → "Grupo Energía Bogotá", for a search that matches how the press names it. */
export function companySearchName(name: string): string {
  return name
    .replace(/\b(S\.?\s?A\.?|E\.?\s?S\.?\s?P\.?|S\.?A\.?S\.?|Corp\.?|Inc\.?|Ltd\.?)(?=\s|$)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1];

export function parseGoogleNewsRss(xml: string): NewsItem[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .flatMap((item) => {
      const link = decode(tag(item, "link") ?? "");
      const source = decode(tag(item, "source") ?? "");
      let title = decode(tag(item, "title") ?? "");
      // Google appends " - <source>" to every title.
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const time = Date.parse(tag(item, "pubDate") ?? "") / 1000;
      if (!title || !link.startsWith("https://")) return [];
      return [{ id: decode(tag(item, "guid") ?? link), title, publisher: source, url: link, time: Number.isFinite(time) ? time : 0, related: [] }];
    })
    .sort((a, b) => b.time - a.time);
}

export async function googleNews(query: string, count = 10): Promise<NewsItem[]> {
  const url = `${GOOGLE_NEWS_URL}?q=${encodeURIComponent(`"${query}"`)}&hl=es-419&gl=CO&ceid=CO:es-419`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Google Noticias: HTTP ${res.status}`);
  return parseGoogleNewsRss(await res.text()).slice(0, count);
}

export async function getNews(symbol: string): Promise<{ news: NewsItem[]; source: "yahoo" | "google" }> {
  if (symbol.endsWith(".CL")) {
    const name = (await yahooQuote(symbol)).name;
    if (name) {
      const news = await googleNews(companySearchName(name)).catch(() => null);
      if (news) return { news, source: "google" };
    }
  }
  return { news: await yahooNews(symbol), source: "yahoo" };
}
