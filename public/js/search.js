// Home page notes tree: live search + state persistence (open folders, query,
// scroll) so navigating into a note and back restores the same view. No backend.
(function () {
  const input = document.getElementById("note-search");
  const tree = document.querySelector(".note-tree");
  if (!tree) return;

  const leaves = Array.from(tree.querySelectorAll("li")).filter((li) =>
    li.querySelector(":scope > a"),
  );
  const folders = Array.from(tree.querySelectorAll("li")).filter((li) =>
    li.querySelector(":scope > details"),
  );
  const KEY = "noteTree";

  function apply() {
    const q = (input ? input.value : "").trim().toLowerCase();
    for (const li of leaves) {
      const a = li.querySelector(":scope > a");
      li.hidden = q !== "" && !a.textContent.toLowerCase().includes(q);
    }
    for (const li of folders) {
      const details = li.querySelector(":scope > details");
      const hasMatch =
        q === "" ||
        Array.from(details.querySelectorAll("li > a")).some((a) => !a.closest("li").hidden);
      li.hidden = !hasMatch;
      details.open = q !== "" && hasMatch;
    }
  }

  function save() {
    try {
      const open = Array.from(tree.querySelectorAll("details[open]")).map((d) => d.dataset.path);
      sessionStorage.setItem(
        KEY,
        JSON.stringify({ open, q: input ? input.value : "", y: window.scrollY }),
      );
    } catch {
      /* sessionStorage unavailable */
    }
  }

  function restore() {
    let s = null;
    try {
      s = JSON.parse(sessionStorage.getItem(KEY) || "null");
    } catch {
      /* ignore */
    }
    if (!s) return;
    if (input) input.value = s.q || "";
    if (s.q) {
      apply(); // filtering decides which folders are open
    } else {
      const open = new Set(s.open || []);
      tree.querySelectorAll("details").forEach((d) => {
        d.open = open.has(d.dataset.path);
      });
    }
    requestAnimationFrame(() => window.scrollTo(0, s.y || 0));
  }

  if (input) input.addEventListener("input", () => { apply(); save(); });
  tree.addEventListener("toggle", save, true); // toggle doesn't bubble
  window.addEventListener("pagehide", save);

  restore();
})();
