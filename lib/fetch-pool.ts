/**
 * Fetch several JSON files a few at a time, each retried once. The host
 * answers a burst of parallel requests with 429 (Too Many Requests): a
 * "Tout réviser" that fetched every deck at once lost one at random
 * (components/TodayReview.tsx). Same cure as the palette's Pagefind
 * fragments (public/js/palette.js): a small pool, one retry after a pause.
 * Resolves with one entry per URL, null where it still failed.
 */
export async function fetchJsonPool<T>(
  urls: string[],
  {
    concurrency = 3,
    retryDelay = 600,
    onEach,
    fetchImpl = fetch,
  }: {
    concurrency?: number;
    retryDelay?: number;
    /** Called as each URL settles (for a "3 / 7" loading line). */
    onEach?: (done: number) => void;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<(T | null)[]> {
  const out: (T | null)[] = Array.from({ length: urls.length }, () => null);
  let next = 0;
  let done = 0;
  const get = async (url: string): Promise<T> => {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return (await r.json()) as T;
  };
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      try {
        out[i] = await get(urls[i]);
      } catch {
        await new Promise((r) => setTimeout(r, retryDelay));
        try {
          out[i] = await get(urls[i]);
        } catch {
          /* left null: the caller names it */
        }
      }
      onEach?.(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return out;
}
