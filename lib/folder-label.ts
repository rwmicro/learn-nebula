// Display labels for the "Notes" tab (app/notes/), shared by its server
// pages and its client rows.

/** "01-Phonologie" → rank "01", label "Phonologie", so a list can keep the
 *  order without the file-name prefix. */
export function splitRank(name: string): {
  rank: string | null;
  label: string;
} {
  const m = /^(\d{1,3})[-_. ]+(.+)$/.exec(name);
  return m ? { rank: m[1], label: m[2] } : { rank: null, label: name };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** A note title without a trailing " — Arabe Libanais" when the folders it
 *  sits in already say so: in /notes/…/arabe/libanais/ every title ends that
 *  way, and the list reads better without it. */
export function shortTitle(title: string, folders: string[]): string {
  const m = /^(.+?)\s+[—–]\s+([^—–]+)$/.exec(title);
  if (!m) return title;
  const known = new Set(folders.flatMap(norm));
  const words = norm(m[2]);
  return words.length > 0 && words.every((w) => known.has(w)) ? m[1] : title;
}
