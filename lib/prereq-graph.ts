// Prerequisite graph (frontmatter `prerequis:`) — the pure part: parsing the
// field, ordering a set of notes so every prerequisite comes before the notes
// that need it, and cutting the graph into reading paths. No fs, no content
// index: lib/content.ts resolves the targets and feeds slugs in, so this file
// is unit-testable on its own (lib/prereq-graph.test.ts).

/** One prerequisite relation, [prerequisite, dependent]: read `[0]` before `[1]`. */
export type PrereqEdge = [string, string];

export interface PrereqNode {
  slug: string;
  title: string;
  /** Discipline display name ("Mathematics"), "" when the note has none. */
  discipline: string;
}

/** `[[Note|alias]]`, `[[Note#heading]]`, `Note.md`, `"  Note "` → `Note`. */
export function cleanPrereqTarget(raw: string): string {
  let s = raw.trim();
  const wiki = s.match(/^!?\[\[([^\]]*)\]\]$/);
  if (wiki) s = wiki[1];
  return s
    .split("|")[0]
    .replace(/\\$/, "")
    .split("#")[0]
    .replace(/\.md$/i, "")
    .trim();
}

/**
 * The note targets a `prerequis:` value names, cleaned and de-duplicated, in
 * the order written. Accepts every spelling a vault ends up with:
 *
 *   prerequis: "[[Limites et Continuité]]"
 *   prerequis: "[[A]], [[B]]"               (several links in one string)
 *   prerequis: ["[[A]]", "Lycée/B"]         (wikilinks or plain titles/paths)
 *   prerequis: [[A]]                        (unquoted: YAML reads [["A"]])
 *   prerequis:
 *     - [[A]]                               (block list: [["A"]] per item)
 */
export function parsePrereqField(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const t = cleanPrereqTarget(raw);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  const visit = (v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x);
      return;
    }
    if (typeof v !== "string" && typeof v !== "number") return;
    const s = String(v);
    const links = [...s.matchAll(/\[\[([^\]]+)\]\]/g)];
    if (links.length) for (const m of links) push(m[1]);
    else push(s);
  };
  visit(value);
  return out;
}

/** Undirected connected components of the nodes that take part in an edge,
 *  each sorted by slug; the list sorted by its first slug. */
export function connectedComponents(edges: PrereqEdge[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // Path compression.
    let c = x;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const [a, b] of edges) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const groups = new Map<string, string[]>();
  for (const x of parent.keys()) {
    const r = find(x);
    groups.set(r, [...(groups.get(r) ?? []), x]);
  }
  return [...groups.values()]
    .map((g) => g.sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export interface TopoResult {
  /** Every input slug, prerequisites first. */
  order: string[];
  /** Edges dropped to break cycles (self-references included). */
  broken: PrereqEdge[];
  /** The cycles found, each as its members (strongly connected component),
   *  sorted like the order ties are (title, then slug). */
  cycles: string[][];
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/**
 * Topological order of `slugs` under `edges` (edges touching other slugs are
 * ignored). Kahn's algorithm, always taking the ready note with the smallest
 * title so the result is stable from one build to the next.
 *
 * A cycle (A needs B, B needs A — a vault mistake, but one a hand-edited
 * frontmatter will make) would stall it: then the stalled notes are split into
 * strongly connected components, the first *source* component (one nothing
 * outside it points into) is taken in title order, and the incoming edges of
 * its first note are dropped. That note becomes ready, the rest of the cycle
 * follows from it, and every dropped edge is reported so vault-health can name
 * the frontmatter to fix.
 */
export function topoOrder(
  slugs: string[],
  edges: PrereqEdge[],
  titleOf: (slug: string) => string = (s) => s,
): TopoResult {
  const nodes = [...new Set(slugs)];
  const inSet = new Set(nodes);
  const cmp = (a: string, b: string) =>
    collator.compare(titleOf(a), titleOf(b)) || (a < b ? -1 : a > b ? 1 : 0);

  const broken: PrereqEdge[] = [];
  const cycles: string[][] = [];
  const out = new Map<string, Set<string>>();
  const inc = new Map<string, Set<string>>();
  for (const n of nodes) {
    out.set(n, new Set());
    inc.set(n, new Set());
  }
  for (const [a, b] of edges) {
    if (!inSet.has(a) || !inSet.has(b)) continue;
    if (a === b) {
      if (!broken.some(([x, y]) => x === a && y === b)) {
        broken.push([a, b]);
        cycles.push([a]);
      }
      continue;
    }
    out.get(a)!.add(b);
    inc.get(b)!.add(a);
  }

  const remaining = new Set(nodes);
  const order: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((n) => inc.get(n)!.size === 0).sort(cmp);
    if (ready.length) {
      const n = ready[0];
      order.push(n);
      remaining.delete(n);
      for (const m of out.get(n)!) inc.get(m)!.delete(n);
      continue;
    }
    // Stalled: every remaining note waits on another one — break a cycle.
    const sccs = stronglyConnected([...remaining].sort(cmp), (n) =>
      [...out.get(n)!].filter((m) => remaining.has(m)).sort(cmp),
    );
    const compOf = new Map<string, number>();
    sccs.forEach((c, i) => c.forEach((n) => compOf.set(n, i)));
    const sources = sccs
      .filter((c, i) =>
        c.every((n) => [...inc.get(n)!].every((p) => compOf.get(p) === i)),
      )
      .map((c) => [...c].sort(cmp))
      .sort((a, b) => cmp(a[0], b[0]));
    const comp = sources[0];
    cycles.push(comp);
    const victim = comp[0];
    for (const p of [...inc.get(victim)!].sort(cmp)) {
      broken.push([p, victim]);
      out.get(p)!.delete(victim);
    }
    inc.get(victim)!.clear();
  }
  return { order, broken, cycles };
}

// Tarjan's algorithm, iterative (a long prerequisite chain must not blow the
// stack). Components come out in reverse topological order; callers sort.
function stronglyConnected(
  nodes: string[],
  next: (n: string) => string[],
): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];
  for (const start of nodes) {
    if (idx.has(start)) continue;
    const work: { n: string; it: string[]; i: number }[] = [];
    const open = (n: string) => {
      idx.set(n, index);
      low.set(n, index);
      index++;
      stack.push(n);
      onStack.add(n);
      work.push({ n, it: next(n), i: 0 });
    };
    open(start);
    while (work.length) {
      const top = work[work.length - 1];
      if (top.i < top.it.length) {
        const m = top.it[top.i++];
        if (!idx.has(m)) open(m);
        else if (onStack.has(m)) low.set(top.n, Math.min(low.get(top.n)!, idx.get(m)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].n;
        low.set(parent, Math.min(low.get(parent)!, low.get(top.n)!));
      }
      if (low.get(top.n) === idx.get(top.n)) {
        const comp: string[] = [];
        let m: string;
        do {
          m = stack.pop()!;
          onStack.delete(m);
          comp.push(m);
        } while (m !== top.n);
        result.push(comp);
      }
    }
  }
  return result;
}

export interface ReadingPath {
  /** Most common discipline among the path's notes (ties A→Z), "" if none. */
  discipline: string;
  /** Slugs in reading order. */
  notes: string[];
  /** The edges of this path, restricted to its notes (cycle breaks removed). */
  edges: PrereqEdge[];
  broken: PrereqEdge[];
  cycles: string[][];
}

/** Minimum number of notes for a connected group to count as a path: two
 *  notes are just "read A first", which the note page already says. */
export const MIN_PATH_NOTES = 3;

/**
 * Every connected component of the prerequisite graph, each in topological
 * order, sorted by discipline then by the title of its first note. Cycles are
 * broken (and reported) in all of them, including the ones too small to make a
 * reading path, so {@link prereqCycles} sees every one.
 */
export function buildPrereqComponents(
  nodes: PrereqNode[],
  edges: PrereqEdge[],
): ReadingPath[] {
  const bySlug = new Map(nodes.map((n) => [n.slug, n]));
  const known = edges.filter(([a, b]) => bySlug.has(a) && bySlug.has(b));
  const titleOf = (s: string) => bySlug.get(s)?.title ?? s;
  const paths: ReadingPath[] = [];
  for (const comp of connectedComponents(known)) {
    const members = new Set(comp);
    const compEdges = known.filter(([a, b]) => members.has(a) && members.has(b));
    const { order, broken, cycles } = topoOrder(comp, compEdges, titleOf);
    const tally = new Map<string, number>();
    for (const s of comp) {
      const d = bySlug.get(s)?.discipline ?? "";
      if (d) tally.set(d, (tally.get(d) ?? 0) + 1);
    }
    const discipline =
      [...tally.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))[0]?.[0] ??
      "";
    const brokenKey = new Set(broken.map(([a, b]) => `${a}\n${b}`));
    paths.push({
      discipline,
      notes: order,
      edges: compEdges.filter(([a, b]) => a !== b && !brokenKey.has(`${a}\n${b}`)),
      broken,
      cycles,
    });
  }
  return paths.sort(
    (a, b) =>
      collator.compare(a.discipline, b.discipline) ||
      collator.compare(titleOf(a.notes[0]), titleOf(b.notes[0])),
  );
}

/** Reading paths: the components with at least `minSize` notes. */
export function buildReadingPaths(
  nodes: PrereqNode[],
  edges: PrereqEdge[],
  minSize = MIN_PATH_NOTES,
): ReadingPath[] {
  return buildPrereqComponents(nodes, edges).filter((p) => p.notes.length >= minSize);
}

/** The cycles across the given components, with the edges dropped to break them. */
export function prereqCycles(paths: ReadingPath[]): { members: string[]; broken: PrereqEdge[] }[] {
  return paths
    .filter((p) => p.cycles.length)
    .flatMap((p) => p.cycles.map((members) => ({
      members,
      broken: p.broken.filter(([a, b]) => members.includes(a) && members.includes(b)),
    })));
}
