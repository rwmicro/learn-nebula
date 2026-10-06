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
