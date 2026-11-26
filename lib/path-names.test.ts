import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LOCALES, DEFAULT_LOCALE, levelNameIn, levelNameKey, pathDescIn, pathDescKey, pathName, pathNameKeys, pathNameRef, splitPathName, t } from "./i18n";

// Reading paths are named in the vault, in French (`parcours:` in a note's
// frontmatter, lib/node/content.ts getReadingPaths()). Their translations live in
// messages/<locale>.json under `pathName.<slug>` ({ title, sub }: the parts
// before and after " : "). A path missing there shows its French name in
// every locale, which is how every path title stayed French until now.

type Entry = { title: string; sub?: string; desc?: string };
const bundle = (locale: string): Record<string, Entry> =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8")).pathName ?? {};

const fr = bundle(DEFAULT_LOCALE);

describe("path name translations", () => {
  it("has entries", () => {
    expect(Object.keys(fr).length).toBeGreaterThan(0);
  });

  // The key-sync test (messages.test.ts) already makes every locale hold the
  // same slugs and parts; this checks they are actually translated.
  const script: Partial<Record<string, RegExp>> = { zh: /\p{Script=Han}/u, ar: /\p{Script=Arabic}/u };
  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    it(`${locale} translates every path name`, () => {
      const own = bundle(locale);
      const untranslated = Object.entries(fr)
        .filter(([slug, f]) => {
          const e = own[slug];
          if (!e?.title?.trim() || (f.sub && !e.sub?.trim())) return true;
          const full = `${e.title} ${e.sub ?? ""}`;
          if (full === `${f.title} ${f.sub ?? ""}`) return true;
          return script[locale] ? !script[locale]!.test(full) : false;
        })
        .map(([slug]) => slug);
      expect(untranslated).toEqual([]);
    });
  }

  it("resolves a name in each locale, whole or in parts", () => {
    const p = { slug: "allemand-des-premiers-mots-a-la-culture", name: "Allemand : des premiers mots à la culture" };
    expect(pathName(p)).toBe(p.name);
    expect(pathName(p, "full", "en")).toBe("German: from first words to culture");
    expect(pathName(p, "title", "zh")).toBe("德语");
    expect(pathName(p, "sub", "es")).toBe("de las primeras palabras a la cultura");
    expect(pathName(p, "full", "id")).toBe("Bahasa Jerman: dari kata pertama hingga budaya");
    // Inside a sentence, through a { $t } placeholder.
    expect(t("parcours.followedBy", { name: pathNameRef(p, "title") }, "en")).toContain("German");
    expect(t("nextUp.pathNext", { path: pathNameRef(p) }, "en")).toContain("German: from first words to culture");
  });

  it("keeps the vault's name for a path it doesn't know", () => {
    const p = { slug: "nowhere", name: "Nulle part : un essai" };
    expect(pathNameKeys(p.slug)).toBeNull();
    expect(pathName(p, "full", "en")).toBe(p.name);
    expect(pathName(p, "title", "en")).toBe("Nulle part");
    expect(pathNameRef(p, "title")).toBe("Nulle part");
  });
});

const levelBundle = (locale: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8")).levelName ?? {};

describe("path descriptions and level names", () => {
  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    it(`${locale} translates every description and level name`, () => {
      const own = bundle(locale);
      const descs = Object.entries(fr)
        .filter(([, f]) => f.desc)
        .filter(([slug, f]) => !own[slug]?.desc?.trim() || own[slug].desc === f.desc)
        .map(([slug]) => slug);
      expect(descs).toEqual([]);
      const lv = levelBundle(locale);
      expect(Object.keys(levelBundle(DEFAULT_LOCALE)).filter((k) => !lv[k]?.trim())).toEqual([]);
    });
  }

  it("resolves them in a locale, and keeps a text the bundles don't spell", () => {
    const slug = "hakka-des-premiers-mots-a-la-culture";
    const desc = fr[slug].desc!;
    expect(pathDescKey(slug, desc)).toBe(`pathName.${slug}.desc`);
    expect(pathDescIn(slug, desc, "id")).toMatch(/Kalimantan Barat/);
    // Edited in the vault since: the vault's French shows in every locale.
    expect(pathDescKey(slug, `${desc} Et plus.`)).toBeNull();
    expect(pathDescIn(slug, "Autre texte.", "id")).toBe("Autre texte.");
    expect(levelNameKey("Phonologie et communication")).toBe("levelName.phonologieetcommunication");
    expect(levelNameIn("Phonologie et communication", "id")).toBe("Fonologi dan komunikasi");
    expect(levelNameIn("Un niveau inconnu", "en")).toBe("Un niveau inconnu");
  });
});

/** Every reading path of the vault under `root` (a folder holding
 *  content/posts), checked against the French bundle: its slug has an entry,
 *  and the entry spells the vault's name. */
async function untranslatedPaths(root: string): Promise<string[]> {
  vi.resetModules();
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  try {
    const { getReadingPaths } = await import("./node/content");
    return getReadingPaths()
      .filter((p) => {
        const e = fr[p.slug];
        const [title, sub] = splitPathName(p.name);
        return !e || e.title !== title || (e.sub ?? "") !== sub;
      })
      .map((p) => `${p.slug} (« ${p.name} »)`);
  } finally {
    cwd.mockRestore();
  }
}

/** The descriptions and level names of the vault under `root` that the
 *  bundles don't translate (an edited `description:` or `niveau:`, or a
 *  level named after a new folder). */
async function untranslatedTexts(root: string): Promise<string[]> {
  vi.resetModules();
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  try {
    const { getReadingPaths, getPost } = await import("./node/content");
    const { namedLevels } = await import("./level-names");
    const out: string[] = [];
    for (const p of getReadingPaths()) {
      if (p.description && !pathDescKey(p.slug, p.description)) out.push(`${p.slug}: description « ${p.description} »`);
      for (const l of namedLevels(p, (s) => getPost(s).frontmatter.title)) {
        // A level named after its first note's title is content, not a name.
        if (l.name === getPost(p.notes[l.from].slug).frontmatter.title) continue;
        if (!levelNameKey(l.name)) out.push(`${p.slug}: niveau « ${l.name} »`);
      }
    }
    return out;
  } finally {
    cwd.mockRestore();
  }
}

describe("every reading path has a translated name", () => {
  it("in the fixture vault", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "path-names-"));
    fs.mkdirSync(path.join(root, "content"));
    fs.symlinkSync(path.join(process.cwd(), "tests", "fixtures", "vault"), path.join(root, "content", "posts"));
    expect(await untranslatedPaths(root)).toEqual([]);
    expect(await untranslatedTexts(root)).toEqual([]);
  });

  // The real vault, once fetched (predev / build). CI runs this file again
  // after its build with REQUIRE_VAULT=1, so a path added or renamed in
  // pensine fails there until its name gets an entry in messages/*.json.
  const posts = path.join(process.cwd(), "content", "posts");
  it.skipIf(!fs.existsSync(posts) && !process.env.REQUIRE_VAULT)("in the fetched vault (content/posts)", async () => {
    expect(fs.existsSync(posts)).toBe(true);
    expect(await untranslatedPaths(process.cwd())).toEqual([]);
    expect(await untranslatedTexts(process.cwd())).toEqual([]);
  });
});
