/** Stable anchor slug for a folder path, shared by the home browse-tree
 *  deep-links and the note-page breadcrumbs. A folder's full on-disk path
 *  (e.g. "Applied Sciences/Agriculture") collapses to a single hash id
 *  ("applied-sciences-agriculture"); note crumbs link to `/#<id>` and
 *  HomeContent opens the matching folder (plus its ancestors) and scrolls to it.
 *  Pure and dependency-free so it's safe to import into the client bundle. */
export function folderAnchor(path: string): string {
  return path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** URL slug for a frontmatter tag or a folder name on the /themes/ pages.
 *  Accents are folded first, so "sécurité" gives "securite" rather than the
 *  "s-curit" folderAnchor would, and two spellings of one tag ("Sécurité",
 *  "securite") land on the same page. */
export function tagSlug(tag: string): string {
  return folderAnchor(tag.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

/** Tags that name the same thing in two spellings or languages, folded onto
 *  one /themes/ page: alias slug → the slug that keeps the page. Only true
 *  synonyms; "france"/"français" or "XIXe"/"XXe siècle" are different themes. */
export const TAG_ALIASES: Readonly<Record<string, string>> = {
  deutsch: "allemand",
  spanish: "espagnol",
  turkish: "turc",
  azeri: "azerbaijani",
  malaisian: "malais",
  fusha: "arabe-standard",
  network: "reseau",
  "privilege-escalation": "privesc",
  recon: "reconnaissance",
  noyau: "kernel",
  art: "arts",
  methode: "methodologie",
  methodes: "methodologie",
  medievale: "moyen-age",
  "apprentissage-ml": "machine-learning",
};

/** A tag's /themes/ slug, after TAG_ALIASES. */
export function tagKey(tag: string): string {
  const slug = tagSlug(tag);
  return TAG_ALIASES[slug] ?? slug;
}
