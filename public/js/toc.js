// Table of contents: the left-margin rail on wide screens, and the
// scrollspy that highlights the section currently in view.
//
// The TOC is rendered once, inside .note-aside (lib/html.ts buildToc). Above
// 1500px that aside is the fixed right-hand column; below it, a drawer behind
// the "sommaire" toggle — which left a 1280-1500px screen with the article
// centred in a 680px column and two thirds of the width empty. So a copy of
// the TOC is placed in the left margin as a sticky rail; CSS (main.css,
// .toc-rail) shows it only in that band and only in the normal reading width
// — "élargir" reclaims the margin, and the drawer remains the way in.
// Sidenotes are inline below 1500px, so the left margin is free there.
(function () {
  const source = document.querySelector(".note-aside .toc");
  if (source && source.querySelector('a[href^="#"]')) {
    const rail = source.cloneNode(true);
    rail.classList.add("toc-rail");
    rail.setAttribute("data-pagefind-ignore", "");
    document.body.appendChild(rail);
  }

  const links = document.querySelectorAll('.toc a[href^="#"]');
  if (!links.length) return;

  // id -> every link pointing at it (the drawer's and the rail's).
  const map = new Map();
  links.forEach((a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(a);
  });

  const headings = Array.from(document.querySelectorAll("main h2[id], main h3[id]")).filter(
    (h) => map.has(h.id),
  );
  if (!headings.length) return;

  let current = null;
  function setActive(id) {
    if (id === current) return;
    if (current) (map.get(current) || []).forEach((a) => {
      a.classList.remove("active");
      a.removeAttribute("aria-current");
    });
    current = id;
    (map.get(id) || []).forEach((a) => {
      a.classList.add("active");
      a.setAttribute("aria-current", "location");
      // Keep the active entry visible inside a rail taller than the screen,
      // by scrolling the rail itself — scrollIntoView would move the page.
      const box = a.closest(".toc-rail");
      if (box && box.scrollHeight > box.clientHeight) {
        const top = a.offsetTop - box.clientHeight / 3;
        box.scrollTop = Math.max(0, top);
      }
    });
  }

  function update() {
    // The reading line: a third of the way down the screen, never above 120px
    // (the sticky bar). The last heading above it owns the view.
    const line = Math.max(120, window.innerHeight * 0.3);
    let active = headings[0].id;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= line) active = h.id;
      else break;
    }
    setActive(active);
  }

  // Recompute only when a heading crosses the top band of the viewport, instead
  // of on every scroll event; the % rootMargin also re-fires on resize.
  const io = new IntersectionObserver(() => update(), {
    rootMargin: "0px 0px -70% 0px",
    threshold: [0, 1],
  });
  headings.forEach((h) => io.observe(h));
  update();
})();
