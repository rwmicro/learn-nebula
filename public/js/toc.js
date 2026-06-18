// Highlights the table-of-contents entry for the section currently in view.
(function () {
  const links = document.querySelectorAll('.toc a[href^="#"]');
  if (!links.length) return;

  const map = new Map();
  links.forEach((a) => map.set(decodeURIComponent(a.getAttribute("href").slice(1)), a));

  const headings = Array.from(document.querySelectorAll("main h2[id], main h3[id]")).filter(
    (h) => map.has(h.id),
  );
  if (!headings.length) return;

  let current = null;
  function setActive(id) {
    if (id === current) return;
    if (current && map.get(current)) map.get(current).classList.remove("active");
    current = id;
    if (id && map.get(id)) map.get(id).classList.add("active");
  }

  let ticking = false;
  function update() {
    ticking = false;
    let active = headings[0].id;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= 120) active = h.id;
      else break;
    }
    setActive(active);
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
})();
