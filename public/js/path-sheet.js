// "Étape 4/20" on a note of a reading path opens the path's steps
// (lib/path-step.ts pathSheetHtml): a panel from the bottom on a phone, a
// card in the middle elsewhere. Ticks the steps this browser has read and
// shows how far along the path the reader is; scrolls this note's step into
// view. Closes on Escape (native <dialog>), the × button or a tap outside.
import { loadStore, isRead } from "../../lib/reading-progress";

(function () {
  const open = document.querySelector(".path-step-open");
  const sheet = document.getElementById("path-sheet");
  if (!open || !sheet || typeof sheet.showModal !== "function") return;
  const tt = (k, v) =>
    window.__i18n && window.__i18n.t ? window.__i18n.t(k, v) : k;
  const links = Array.from(sheet.querySelectorAll(".path-sheet-list a[data-slug]"));
  const readEl = sheet.querySelector(".path-sheet-read");
  const pctEl = sheet.querySelector(".path-sheet-pct");
  const bar = sheet.querySelector(".path-sheet-bar i");

  function paint() {
    const store = loadStore();
    let n = 0;
    for (const a of links) {
      const done = isRead(store, a.getAttribute("data-slug"));
      a.parentElement.classList.toggle("is-read", done);
      if (done) n++;
    }
    const vars = { n, total: links.length };
    readEl.setAttribute("data-i18n-vars", JSON.stringify(vars));
    readEl.textContent = tt("pathStep.read", vars);
    const pct = links.length ? Math.round((n / links.length) * 100) : 0;
    pctEl.textContent = `${pct} %`;
    bar.style.width = `${pct}%`;
  }

  function show() {
    paint();
    sheet.showModal();
    document.documentElement.classList.add("path-sheet-open");
    const here = sheet.querySelector(".is-here");
    const list = sheet.querySelector(".path-sheet-list");
    // This note's step a third of the way down, the ones read just above it.
    if (here && list) {
      list.scrollTop +=
        here.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 3;
    }
    open.setAttribute("aria-expanded", "true");
  }
  function close() {
    sheet.close();
  }
  sheet.addEventListener("close", () => {
    document.documentElement.classList.remove("path-sheet-open");
    open.setAttribute("aria-expanded", "false");
  });

  open.setAttribute("aria-expanded", "false");
  open.addEventListener("click", show);
  sheet.querySelector(".path-sheet-close")?.addEventListener("click", close);
  // A tap on the backdrop lands on the <dialog> itself, outside its box.
  sheet.addEventListener("click", (e) => {
    if (e.target !== sheet) return;
    const r = sheet.getBoundingClientRect();
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close();
  });
  window.addEventListener("gk:reading-change", () => {
    if (sheet.open) paint();
  });
})();
