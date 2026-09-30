import { extractPlain, truncate } from "./markdown";

export interface FeedItem {
  title: string;
  /** Absolute URL of the note. */
  url: string;
  /** When the note was planted or last tended (lib/content.ts getRecentNotes). */
  at: Date;
  description: string;
}

export interface FeedChannel {
  title: string;
  /** Absolute URL of the site. */
  link: string;
  /** Absolute URL of the feed itself (atom:link rel="self"). */
  self: string;
  description: string;
  language: string;
}

/** XML-escape text content / attribute values, dropping the control
 *  characters XML 1.0 forbids outright (a stray one would make the whole
 *  feed unparseable). */
export function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Blocks that aren't prose: headings, quotes/callouts, tables, embeds, raw
// HTML, lists, rules, math.
const NOT_PROSE = /^(?:#|>|\||!|<|[-*+] |\d+[.)] |---|\*\*\*|\$\$|\{\{)/;

/**
 * The note's first real paragraph as plain text, for an RSS <description>:
 * the first blank-line-separated block that isn't a heading, callout, list,
 * table, embed or code, flattened with the same extractPlain() as the meta
 * description. Falls back to the start of the whole note.
 */
export function firstParagraph(body: string, max = 300): string {
  const prose = body
    .replace(/^(`{3,}|~{3,})[\s\S]*?^\1/gm, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "");
  for (const block of prose.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b || NOT_PROSE.test(b)) continue;
    // Obsidian wikilinks aren't markdown, so remark would keep the brackets:
    // [[Target|alias]] reads as "alias", [[Target#Section]] as "Target".
    const plain = extractPlain(
      b.replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t, a) => a ?? t),
    );
    if (plain.length >= 40) return truncate(plain, max);
  }
  return truncate(extractPlain(body), max);
}

/** An RSS 2.0 document. Each item's guid carries the date it was ranked on,
 *  so a note that gets re-tended resurfaces in feed readers instead of being
 *  deduplicated against its first appearance. */
export function buildRss(channel: FeedChannel, items: FeedItem[]): string {
  const newest = items.reduce<Date | null>(
    (d, i) => (!d || i.at > d ? i.at : d),
    null,
  );
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `<channel>`,
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(channel.link)}</link>`,
    `<description>${escapeXml(channel.description)}</description>`,
    `<language>${escapeXml(channel.language)}</language>`,
    `<atom:link href="${escapeXml(channel.self)}" rel="self" type="application/rss+xml"/>`,
    // Newest item rather than build time: a rebuild with no content change
    // shouldn't look like an update to every reader polling the feed.
    ...(newest ? [`<lastBuildDate>${newest.toUTCString()}</lastBuildDate>`] : []),
    ...items.map((i) =>
      [
        `<item>`,
        `<title>${escapeXml(i.title)}</title>`,
        `<link>${escapeXml(i.url)}</link>`,
        `<guid isPermaLink="false">${escapeXml(`${i.url}#${i.at.toISOString().slice(0, 10)}`)}</guid>`,
        `<pubDate>${i.at.toUTCString()}</pubDate>`,
        `<description>${escapeXml(i.description)}</description>`,
        `</item>`,
      ].join(""),
    ),
    `</channel>`,
    `</rss>`,
  ];
  return lines.join("\n") + "\n";
}
