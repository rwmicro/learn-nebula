import { describe, expect, it } from "vitest";
import { pathSheetHtml, pathStepHtml, pathStepOf, type PathStepPath } from "./path-step";

const notes = (...s: string[]) => s.map((slug) => ({ slug, title: slug.toUpperCase() }));
const big: PathStepPath = { slug: "analyse", name: "Analyse", notes: notes("a", "b", "c", "d") };
const small: PathStepPath = { slug: "algebre", name: "Algèbre", notes: notes("x", "c", "y") };
const tiny: PathStepPath = { slug: "z", name: "Zeta", notes: notes("c", "q", "r") };

describe("pathStepOf", () => {
  it("places a note in its largest path, with neighbours", () => {
    const s = pathStepOf("c", [small, big, tiny])!;
    expect(s.path.slug).toBe("analyse");
    expect([s.index, s.prev?.slug, s.next?.slug]).toEqual([2, "b", "d"]);
    expect(s.others).toEqual([
      { slug: "algebre", name: "Algèbre" },
      { slug: "z", name: "Zeta" },
    ]);
  });
  it("has no previous note at the start, no next at the end, nothing outside paths", () => {
    expect(pathStepOf("a", [big])!.prev).toBeNull();
    expect(pathStepOf("d", [big])!.next).toBeNull();
    expect(pathStepOf("nope", [big])).toBeNull();
  });
});

describe("pathStepHtml", () => {
  it("renders the step, the path link, prev/next and the nested block", () => {
    const html = pathStepHtml(pathStepOf("b", [big, small])!, '<div class="prereq">P</div>');
    expect(html).toContain('href="/parcours/analyse/"');
    expect(html).toContain("Étape 2/4");
    expect(html).toContain('rel="prev" href="/posts/a/"');
    expect(html).toContain('rel="next" href="/posts/c/"');
    expect(html).toContain("data-pagefind-ignore");
    expect(html).toContain("path-step--with-prereq");
    expect(html).toMatch(/<\/div><div class="prereq">P<\/div><dialog class="path-sheet"[\s\S]*<\/dialog><\/nav>$/);
    expect(html).toContain('<button type="button" class="path-step-open" aria-haspopup="dialog" aria-controls="path-sheet">');
  });
  it("links one other path directly and lists several", () => {
    expect(pathStepHtml(pathStepOf("c", [big, small])!)).toContain(
      '<a class="path-step-others" href="/parcours/algebre/" title="Algèbre"',
    );
    const many = pathStepHtml(pathStepOf("c", [big, small, tiny])!);
    expect(many).toContain("<details class=\"path-step-others\">");
    expect(many).toContain("+2 autres parcours");
  });
  it("escapes titles and names", () => {
    const p: PathStepPath = { slug: "p", name: "<b>", notes: [{ slug: "a", title: 'x"<y' }, { slug: "b", title: "B" }] };
    const html = pathStepHtml(pathStepOf("b", [p])!);
    expect(html).not.toContain("<b>");
    expect(html).toContain("x&quot;&lt;y");
  });
});

describe("pathSheetHtml", () => {
  it("lists every step, marks this one and tags the next", () => {
    const html = pathSheetHtml(pathStepOf("b", [big])!);
    expect(html.match(/<li/g)).toHaveLength(4);
    expect(html).toContain('<li class="is-here"><a href="/posts/b/" data-slug="b" aria-current="page">');
    expect(html).toMatch(/data-slug="c">[\s\S]*?path-sheet-tag--next/);
    expect(html).toContain('href="/parcours/analyse/"');
    expect(html).toContain('class="path-sheet-btn path-sheet-btn--go" href="/posts/c/"');
  });
  it("has no next-step button on the last step", () => {
    expect(pathSheetHtml(pathStepOf("d", [big])!)).not.toContain("path-sheet-btn--go");
  });
});
