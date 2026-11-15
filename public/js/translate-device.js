// A note translated on the device, in place: the part of the translate
// widget (public/js/translate.js) fetched on the first translation
// (translate-device.bundle.js), since most readers never translate.
//
// Two translators, one run: Chrome's Translator API where it covers the
// pair, else the device's model (lib/garden-ai.ts: Gemini Nano, or the
// downloaded Qwen3.5 / LFM2). The note's leaf blocks are marked as waiting,
// then sent in small batches (lib/translate-plan.ts): table cells and short
// lines several to a call, a paragraph alone. Inline markup travels as short
// tags (<t0>…</t0> keeps the text inside to translate, <k0></k0> stands for
// something kept as written: code, maths, a pronunciation word), so the
// model never sees long attributes and the original elements are put back
// around its words.
//
// The body is saved after every batch, with its marks: "Arrêter", a closed
// tab or a failed passage lose nothing, and picking the language again
// resumes where it stopped.
import { aiRoute, deviceError, openDeviceSeries } from "../../lib/garden-ai.ts";
import { deviceWord, localModelLangs } from "../../lib/garden-ai-flags.ts";
import { translateSystem } from "../../lib/ask-prompts.ts";
import { localModel } from "../../lib/local-llm.ts";
import { columnLangs } from "../../lib/read-aloud-dom.ts";
import {
  batchPrompt,
  isRtl,
  maxTokensFor,
  parseBatch,
  planBatches,
  progressOf,
  tagsBalanced,
  worthTranslating,
} from "../../lib/translate-plan.ts";

const hasTranslator = "Translator" in self;
// Text inside these stays as written: code, maths, figures, the word a
// pronunciation clip says, and anything the author marked translate="no".
const KEEP =
  "pre, code, kbd, samp, script, style, svg, math, .katex, .katex-display, " +
  ".pron-label, .pron-tr, [translate='no'], .notranslate, .mermaid";
const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, dt, dd, summary";
// Blocks whose "couldn't translate" note goes inside them: after a cell or
// an item it would land in the row or the list and break it.
const INSIDE = "td, th, li, dt, dd, summary";
const VIA_LOCAL = ":local";
const GLOBE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>';
const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>';
const WARN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.3v.2"/></svg>';

const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hasLetters = (s) => /\p{L}/u.test(s || "");

/** A block's content as text with short tags. */
function encodeBlock(el) {
  const shells = [];
  const kept = [];
  const walk = (node) => {
    let out = "";
    for (const c of node.childNodes) {
      if (c.nodeType === 3) out += escText(c.data.replace(/\s*\n\s*/g, " "));
      else if (c.nodeType === 1) {
        if (c.matches(KEEP) || !hasLetters(c.textContent)) {
          out += `<k${kept.length}></k${kept.length}>`;
          kept.push(c);
        } else {
          const i = shells.length;
          shells.push(c);
          out += `<t${i}>${walk(c)}</t${i}>`;
        }
      }
    }
    return out;
  };
  return { text: walk(el).trim(), shells, kept };
}

/** The translator's fragment back into nodes; null when it was cut short,
 *  or a tag went missing or was made up. */
function decodeBlock(text, shells, kept) {
  if (!tagsBalanced(text)) return null;
  const tpl = document.createElement("template");
  tpl.innerHTML = text;
  const seen = new Set();
  let ok = true;
  const build = (src, dest) => {
    for (const c of Array.from(src.childNodes)) {
      if (c.nodeType === 3) dest.append(c.data);
      else if (c.nodeType === 1) {
        const m = /^([tk])(\d+)$/.exec(c.localName);
        const key = m && m[0];
        const orig = m && (m[1] === "t" ? shells : kept)[Number(m[2])];
        if (!orig || seen.has(key)) {
          ok = false;
          continue;
        }
        seen.add(key);
        if (m[1] === "k") dest.append(orig.cloneNode(true));
        else {
          const shell = orig.cloneNode(false);
          build(c, shell);
          dest.append(shell);
        }
      }
    }
  };
  const frag = document.createDocumentFragment();
  build(tpl.content, frag);
  if (!ok || seen.size !== shells.length + kept.length) return null;
  if (!hasLetters(frag.textContent)) return null;
  return frag;
}

/** The text of `el` a translator would see: without what is kept as is. */
function ownText(el) {
  let out = "";
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) out += c.data;
      else if (c.nodeType === 1 && !c.matches(KEEP)) walk(c);
    }
  };
  walk(el);
  return out;
}

/** Whether a cell sits in a column its table's header gives to another
 *  language than the note's prose ("Javanais", "Pinyin" beside "Français"):
 *  those words are what the note teaches, not text to translate. */
function foreignCell(el, sourceLang, cache) {
  const cell = el.closest("td");
  const row = cell && cell.parentElement;
  const table = cell && cell.closest("table");
  if (!cell || !row || !table || row.parentElement?.localName === "thead") return false;
  if (!cache.has(table)) cache.set(table, columnLangs(table));
  const cols = cache.get(table);
  if (!cols.length) return false;
  let col = 0;
  for (const c of row.children) {
    if (c === cell) break;
    col += Math.max(1, Number(c.getAttribute("colspan")) || 1);
  }
  return !!cols[col] && cols[col] !== sourceLang;
}

function leafBlocks(root, sourceLang) {
  const tables = new Map();
  return Array.from(root.querySelectorAll(BLOCKS)).filter((el) => {
    if (el.closest(KEEP) || el.querySelector(BLOCKS)) return false;
    if (!worthTranslating(ownText(el))) return false;
    const marked = el.closest("[lang]");
    if (marked && root.contains(marked) && marked !== root) {
      const lang = marked.getAttribute("lang").toLowerCase().split("-")[0];
      if (lang && lang !== sourceLang) return false;
    }
    return !foreignCell(el, sourceLang, tables);
  });
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(undefined), ms))]);

/**
 * Chrome's Translator for the pair, or null. Some builds never answer
 * availability() (seen in headless Chromium): after `QUIET_MS` without a
 * word, and no download under way, the device's model takes over instead of
 * a button left on "Traduction…" for good.
 */
const QUIET_MS = 8000;
async function openTranslator(sourceLang, targetLang, onDownload) {
  if (!hasTranslator || !sourceLang || sourceLang === targetLang) return null;
  const pair = { sourceLanguage: sourceLang, targetLanguage: targetLang };
  try {
    const a = await withTimeout(self.Translator.availability(pair), QUIET_MS);
    if (!a || a === "unavailable") return null;
    let downloading = false;
    const created = self.Translator.create({
      ...pair,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          downloading = true;
          onDownload(e.loaded);
        });
      },
    });
    created.catch(() => {});
    for (;;) {
      const t = await withTimeout(created, QUIET_MS);
      if (t) return t;
      if (!downloading) return null;
      downloading = false;
    }
  } catch {
    return null;
  }
}

/** One block through Chrome's Translator when its tags didn't survive: text
 *  node by text node, as before (each keeps its surrounding whitespace). */
async function translateNodes(el, translator) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!hasLetters(n.data)) continue;
    if (n.parentElement && n.parentElement.closest(KEEP)) continue;
    nodes.push(n);
  }
  const out = [];
  for (const n of nodes) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.data);
    out.push(m[1] + (await translator.translate(m[2])) + m[3]);
  }
  nodes.forEach((n, i) => (n.data = out[i]));
}

export function createTranslator(ctx) {
  const { articleBody, originalHtml, sourceLang, tt } = ctx;
  let card = null;
  let pill = null;
  let pillObserver = null;
  let toast = null;
  let toastTimer = null;
  let abort = null;
  let shown = null; // the language on screen
  let translatedHtml = null; // for the [langue | Original] switch

  const uiLocale = () =>
    (window.__i18n && (window.__i18n.locale || window.__i18n.defaultLocale)) || "fr";
  const langName = (code, ui) => {
    try {
      return new Intl.DisplayNames([ui], { type: "language" }).of(code) || code;
    } catch {
      return code;
    }
  };
  const onPhone = () => deviceWord() === "phone";

  // ----------------------------------------------------------------- store
  const read = (lang) => {
    try {
      const html = localStorage.getItem(ctx.cacheKeyFor(lang));
      return html ? { html, local: !!localStorage.getItem(ctx.cacheKeyFor(lang) + VIA_LOCAL) } : null;
    } catch {
      return null;
    }
  };
  /** The body as it is kept: its marks stay (waiting, failed), what only
   *  this page can use goes. False when there is no room for it. */
  function store(lang) {
    const copy = articleBody.cloneNode(true);
    copy.querySelectorAll(".translate-failed-note").forEach((n) => n.remove());
    copy.querySelectorAll(".translate-now").forEach((n) => {
      n.classList.replace("translate-now", "translate-pending");
      n.removeAttribute("data-tr-label");
    });
    const key = ctx.cacheKeyFor(lang);
    const put = () => {
      localStorage.setItem(key, copy.innerHTML);
      localStorage.setItem(key + VIA_LOCAL, "1");
    };
    try {
      put();
      return true;
    } catch {
      // No room: the translations kept for other notes go first.
      try {
        const mine = `translate:${location.pathname}:`;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith("translate:") && !k.startsWith(mine)) localStorage.removeItem(k);
        }
        put();
        return true;
      } catch {
        return false;
      }
    }
  }
  function forget(lang) {
    try {
      localStorage.removeItem(ctx.cacheKeyFor(lang));
      localStorage.removeItem(ctx.cacheKeyFor(lang) + VIA_LOCAL);
    } catch {
      /* nothing kept */
    }
  }

  // ------------------------------------------------------------------ page
  function setLang(lang) {
    const main = document.getElementById("main");
    if (lang) {
      if (main) main.setAttribute("lang", lang);
      if (isRtl(lang)) articleBody.setAttribute("dir", "rtl");
      else articleBody.removeAttribute("dir");
      return;
    }
    articleBody.removeAttribute("dir");
    if (!main) return;
    if (sourceLang === "en") main.setAttribute("lang", "en");
    else main.removeAttribute("lang");
  }
  function show(html, lang) {
    ctx.stash();
    articleBody.innerHTML = html;
    ctx.fixRelativeAssets(articleBody);
    setLang(lang);
    shown = lang;
  }
  const waitingBlocks = () =>
    Array.from(articleBody.querySelectorAll(".translate-pending, .translate-failed"));
  const failedBlocks = () => Array.from(articleBody.querySelectorAll(".translate-failed"));
  function noteFailed(el) {
    if (el.querySelector(":scope > .translate-failed-note")) return;
    const inside = el.matches(INSIDE);
    if (!inside && el.nextElementSibling?.classList.contains("translate-failed-note")) return;
    const note = document.createElement(inside ? "span" : "div");
    note.className = "translate-failed-note";
    note.setAttribute("data-pagefind-ignore", "");
    note.textContent = tt("noteActions.translateBlockFailed") + " · ";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "translate-retry";
    retry.textContent = tt("noteActions.translateRetry");
    note.append(retry);
    if (inside) el.append(note);
    else el.after(note);
  }
  const dropNotes = () =>
    articleBody.querySelectorAll(".translate-failed-note").forEach((n) => n.remove());
  const unclass = (el, name) => {
    el.classList.remove(name);
    if (el.classList.length === 0) el.removeAttribute("class");
  };

  // ----------------------------------------------------------------- cards
  function hidePill() {
    if (pillObserver) pillObserver.disconnect();
    pillObserver = null;
    if (pill) pill.remove();
    pill = null;
  }
  function hideCard() {
    hidePill();
    if (card) card.remove();
    card = null;
  }
  function hideToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    if (toast) toast.remove();
    toast = null;
  }
  function cardShell(state, icon, title, sub) {
    hideCard();
    ctx.clearNote();
    card = document.createElement("div");
    card.className = "translate-local";
    card.dataset.state = state;
    card.setAttribute("data-pagefind-ignore", "");
    card.innerHTML = `<div class="tl-row">${icon}<div class="tl-text"><b></b><span></span></div></div>`;
    card.querySelector("b").textContent = title;
    card.querySelector(".tl-text span").textContent = sub;
    articleBody.before(card);
    return card;
  }
  function button(cls, text, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  // While it runs: "Traduction en anglais…", "Arrêter", a bar with one
  // segment per section and "Section 3 sur 7 · 42 % · encore 4 min"; once
  // the card has scrolled away, a pill under the top bar keeps the count
  // and the stop button.
  function showRunningCard(targetLang, total) {
    const name = langName(targetLang, uiLocale());
    const c = cardShell(
      "running",
      GLOBE,
      tt("noteActions.translateRunning", { lang: name }),
      tt(onPhone() ? "noteActions.translatePrivatePhone" : "noteActions.translatePrivateDevice"),
    );
    c.querySelector(".tl-row").append(button("tl-stop", tt("noteActions.translateStop"), stop));
    const bar = document.createElement("div");
    bar.className = "tl-bar";
    bar.setAttribute("aria-hidden", "true");
    for (let i = 0; i < total; i++) bar.append(document.createElement("i"));
    const count = document.createElement("div");
    count.className = "tl-count";
    count.setAttribute("role", "status");
    c.append(bar, count);

    pill = document.createElement("div");
    pill.className = "translate-pill";
    pill.hidden = true;
    pill.setAttribute("data-pagefind-ignore", "");
    pill.innerHTML =
      '<span class="tl-ring" aria-hidden="true"></span><span><b></b> · <span></span></span><button type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>';
    pill.querySelector("b").textContent = name;
    const x = pill.querySelector("button");
    x.setAttribute("aria-label", tt("noteActions.translateStop"));
    x.addEventListener("click", stop);
    document.body.append(pill);
    if ("IntersectionObserver" in window) {
      pillObserver = new IntersectionObserver(([e]) => {
        if (pill) pill.hidden = e.isIntersecting || e.boundingClientRect.top > 0;
      });
      pillObserver.observe(c);
    }
  }
  function setCount(text, pct) {
    if (!card || card.dataset.state !== "running") return;
    card.querySelector(".tl-count").textContent = text;
    if (pill) {
      pill.querySelector("b + span").textContent = text;
      pill.style.setProperty("--p", `${pct}%`);
    }
  }
  /** The model is still coming: its download, or its loading. */
  function setLoading(fraction) {
    setCount(
      fraction == null || fraction >= 1
        ? tt("noteActions.translatePreparing")
        : tt("noteActions.translateDownloading", { n: Math.floor(fraction * 100) }),
      0,
    );
  }
  function setProgress(section, total, p) {
    if (!card || card.dataset.state !== "running") return;
    card.querySelectorAll(".tl-bar i").forEach((seg, i) => {
      seg.className = i < section ? "is-done" : i === section ? "is-now" : "";
    });
    const parts = [
      tt("noteActions.translateSection", { n: Math.min(section + 1, total), total }),
      `${p.pct} %`,
    ];
    if (p.secondsLeft != null)
      parts.push(
        p.secondsLeft < 50
          ? tt("noteActions.translateLeftSoon")
          : tt("noteActions.translateLeft", { n: Math.max(1, Math.round(p.secondsLeft / 60)) }),
      );
    setCount(parts.join(" · "), p.pct);
  }

  // "Traduit en anglais" with an [English | Original] switch that swaps the
  // two without translating again; with passages left as written, how many
  // and "Réessayer".
  function showDoneCard(targetLang, kept = true) {
    const name = langName(targetLang, uiLocale());
    const failed = failedBlocks().length;
    const c = cardShell(
      failed ? "partial" : "done",
      failed ? WARN : CHECK,
      tt("noteActions.translateDone", { lang: name }),
      failed
        ? tt("noteActions.translatePartial", { n: failed })
        : !kept
          ? tt("noteActions.translateNotKept")
          : tt(onPhone() ? "noteActions.translateKeptPhone" : "noteActions.translateKeptDevice"),
    );
    if (failed)
      c.querySelector(".tl-row").append(
        button("tl-stop", tt("noteActions.translateRetry"), () => ctx.pick(targetLang)),
      );
    const sw = document.createElement("div");
    sw.className = "tl-switch";
    sw.setAttribute("role", "group");
    const toLang = button("", langName(targetLang, targetLang) || name, () => {
      if (toLang.getAttribute("aria-pressed") === "true" || !translatedHtml) return;
      show(translatedHtml, targetLang);
      press(true);
    });
    toLang.lang = targetLang;
    const toOrig = button("", tt("noteActions.translateOriginal"), () => {
      if (toOrig.getAttribute("aria-pressed") === "true") return;
      translatedHtml = articleBody.innerHTML;
      ctx.unstash();
      setLang(null);
      press(false);
    });
    const press = (translated) => {
      toLang.setAttribute("aria-pressed", String(translated));
      toOrig.setAttribute("aria-pressed", String(!translated));
    };
    press(true);
    sw.append(toLang, toOrig);
    c.append(sw);
  }

  // "Traduction en pause · 42 % gardés · Reprendre / Effacer".
  function showPausedCard(targetLang, pct) {
    const c = cardShell(
      "paused",
      GLOBE,
      tt("noteActions.translatePaused", { lang: langName(targetLang, uiLocale()) }),
      tt("noteActions.translatePausedSub", { n: pct }),
    );
    c.querySelector(".tl-row").append(
      button("tl-stop", tt("noteActions.translateResume"), () => ctx.pick(targetLang)),
      button("tl-drop", tt("noteActions.translateDiscard"), () => {
        forget(targetLang);
        hideCard();
      }),
    );
  }

  // The translation could not run at all: why, when the device said, and
  // "Réessayer".
  function showFailedCard(targetLang, why) {
    const c = cardShell(
      "failed",
      WARN,
      tt("noteActions.translateLocalFailed"),
      why ? tt("noteActions.translateWhy", { why }) : tt("noteActions.translateWhyUnknown"),
    );
    c.setAttribute("role", "alert");
    c.querySelector(".tl-row").append(
      button("tl-stop", tt("noteActions.translateRetry"), () => ctx.pick(targetLang)),
    );
  }

  // "Note traduite · 7 sections · Annuler", a few seconds above the bottom bar.
  function showToast(total) {
    hideToast();
    toast = document.createElement("div");
    toast.className = "translate-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("data-pagefind-ignore", "");
    const text = document.createElement("span");
    text.textContent = tt("noteActions.translateFinished", { total });
    toast.append(text, button("", tt("noteActions.translateUndo"), ctx.restore));
    document.body.append(toast);
    toastTimer = setTimeout(hideToast, 5000);
  }

  // ------------------------------------------------------------------- run
  /** "Arrêter": what is done stays kept, the note goes back to its text. */
  function stop() {
    if (abort) abort.abort();
  }

  /** Everything this module put on the page goes; the body is the caller's
   *  to restore. */
  function clear() {
    if (abort) abort.abort();
    abort = null;
    hideCard();
    hideToast();
    setLang(null);
    shown = null;
    translatedHtml = null;
  }

  // The section of each block: how many h2 of the body come before it.
  function sectionsOf(blocks) {
    const heads = Array.from(articleBody.querySelectorAll("h2"));
    const first = articleBody.firstElementChild;
    const lead = heads.length && first && !first.matches("h2") ? 1 : 0;
    const total = Math.max(1, heads.length + lead);
    const sec = blocks.map((b) => {
      let n = 0;
      for (const h of heads)
        if (h === b || h.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) n++;
      return Math.max(0, n - 1 + lead);
    });
    return { sec, total };
  }

  /**
   * Translate what is marked as waiting in the body. `runner.run(prompt,
   * opts)` answers one prompt, `runner.single` says it takes one block at a
   * time, `runner.nodes(el)` is its last resort for a block whose tags came
   * back wrong. Resolves "done", "stopped" or "failed".
   */
  async function run(targetLang, open, single) {
    const blocks = waitingBlocks();
    dropNotes();
    for (const b of blocks) b.classList.replace("translate-failed", "translate-pending");
    const { sec, total } = sectionsOf(blocks);
    const all = articleBody.querySelectorAll(BLOCKS).length || 1;
    showRunningCard(targetLang, total);
    setLoading(null);
    abort = new AbortController();
    const signal = abort.signal;
    const stopped = () => {
      const left = waitingBlocks().length;
      // Whatever was mid-way is still waiting in the kept copy.
      const kept = store(targetLang);
      ctx.restore();
      if (kept && left) showPausedCard(targetLang, Math.round(100 * (1 - left / Math.max(1, all))));
      return "stopped";
    };
    let runner;
    try {
      runner = await open(signal, setLoading);
    } catch {
      return stopped();
    }
    if (signal.aborted) return stopped();
    if (!runner) {
      abort = null;
      ctx.restore();
      showFailedCard(targetLang, deviceError());
      return "failed";
    }

    const enc = blocks.map(encodeBlock);
    const lengths = enc.map((e) => e.text.length);
    const batches = single
      ? blocks.map((_, i) => [i])
      : planBatches(
          lengths,
          blocks.map((b) => /^h[1-6]$/.test(b.localName)),
        );
    const totalChars = lengths.reduce((a, b) => a + b, 0);
    let doneChars = 0;
    let translated = 0;
    const started = Date.now();
    const nowLabel = tt("noteActions.translateCurrent");
    const apply = (i, text) => {
      if (text == null) return false;
      const frag = decodeBlock(text, enc[i].shells, enc[i].kept);
      if (!frag) return false;
      blocks[i].replaceChildren(frag);
      return true;
    };
    const ask = async (indexes) => {
      const texts = indexes.map((i) => enc[i].text);
      const out = await runner.run(batchPrompt(texts), {
        maxTokens: maxTokensFor(texts.join("").length + 6 * texts.length),
        signal,
      });
      return out == null ? indexes.map(() => null) : parseBatch(out, indexes.length);
    };

    try {
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        for (const i of batch) {
          blocks[i].classList.replace("translate-pending", "translate-now");
          blocks[i].dataset.trLabel = nowLabel;
        }
        setProgress(sec[batch[0]], total, progressOf(doneChars, totalChars, Date.now() - started));
        const parts = await ask(batch);
        if (signal.aborted) return stopped();
        for (let j = 0; j < batch.length; j++) {
          const i = batch[j];
          let ok = apply(i, parts[j]);
          // A line the batch lost, or whose tags came back wrong: asked
          // again on its own, then by the translator's last resort.
          if (!ok && batch.length > 1) {
            ok = apply(i, (await ask([i]))[0]);
            if (signal.aborted) return stopped();
          }
          if (!ok && runner.nodes) {
            try {
              await runner.nodes(blocks[i]);
              ok = true;
            } catch {
              /* stays as written */
            }
            if (signal.aborted) return stopped();
          }
          blocks[i].classList.remove("translate-now");
          delete blocks[i].dataset.trLabel;
          if (ok) {
            translated++;
            unclass(blocks[i], "translate-pending");
          } else blocks[i].classList.add("translate-failed");
          doneChars += lengths[i];
        }
        // Nothing came out of the first batches: the model can't run here,
        // and going through the whole note would only take longer to say so.
        if (!translated && b >= 2) break;
        store(targetLang);
      }
    } catch (e) {
      if (signal.aborted) return stopped();
      // The translator itself broke: what is done stays, the rest waits.
      if (!translated) {
        abort = null;
        runner.close();
        ctx.restore();
        showFailedCard(targetLang, deviceError() || String((e && e.message) || ""));
        return "failed";
      }
    } finally {
      runner.close();
    }
    abort = null;
    if (!translated) {
      forget(targetLang);
      ctx.restore();
      showFailedCard(targetLang, deviceError());
      return "failed";
    }
    // Blocks never reached (the translator broke mid-way) are failures to
    // retry, like the ones it gave nothing for.
    for (const el of waitingBlocks()) {
      el.classList.remove("translate-pending", "translate-now");
      el.classList.add("translate-failed");
    }
    const kept = store(targetLang);
    failedBlocks().forEach(noteFailed);
    translatedHtml = articleBody.innerHTML;
    showDoneCard(targetLang, kept);
    showToast(total);
    return "done";
  }

  /**
   * Translate the note into `targetLang`. Resolves:
   *  "done" (the translation is on screen), "stopped", "failed" (a card
   *  says so), "setup" (the download sheet is open), "server" (nothing on
   *  the device: the caller may ask the server).
   */
  async function translate(targetLang) {
    hideToast();
    const kept = read(targetLang);
    // A translation kept whole: instant.
    if (kept && !/translate-(pending|failed)/.test(kept.html)) {
      show(kept.html, targetLang);
      translatedHtml = articleBody.innerHTML;
      if (kept.local) showDoneCard(targetLang);
      else hideCard();
      return "done";
    }
    const begin = () => {
      if (kept) {
        show(kept.html, targetLang);
        return;
      }
      show(originalHtml, targetLang);
      for (const b of leafBlocks(articleBody, sourceLang || "fr")) b.classList.add("translate-pending");
    };

    // Chrome's Translator first.
    const translator = await openTranslator(sourceLang, targetLang, (f) =>
      ctx.setLabel(tt("noteActions.translateDownloading", { n: Math.round(f * 100) })),
    );
    if (translator) {
      begin();
      if (!waitingBlocks().length) return "failed";
      return run(
        targetLang,
        async () => ({
          run: (prompt) => translator.translate(prompt),
          nodes: (el) => translateNodes(el, translator),
          close() {
            try {
              if (translator.destroy) translator.destroy();
            } catch {
              /* already gone */
            }
          },
        }),
        true,
      );
    }

    const route = await aiRoute(targetLang);
    if (route === "nano" || route === "local") {
      begin();
      if (!waitingBlocks().length) return "failed";
      const system = translateSystem(langName(sourceLang || "fr", "fr"), langName(targetLang, "fr"));
      return run(targetLang, (signal, onLoad) =>
        openDeviceSeries({ route, system, lang: targetLang, signal, onLoad }),
      );
    }
    if (route === "server") return "server";
    // Nothing on this device yet: the chat's sheet offers the download (and
    // translates once agreed), or says this browser can't.
    window.dispatchEvent(
      new CustomEvent("gk:ai-setup", {
        detail: { for: "translate", after: () => ctx.pick(targetLang) },
      }),
    );
    return "setup";
  }

  /** What the menu should say before a language is picked: "ready",
   *  "download" (a model to fetch first, of `gb` GB) or "none". */
  async function state() {
    const route = await aiRoute(uiLocale());
    if (route === "nano" || route === "local") return { state: "ready" };
    if (route === "download") return { state: "download", gb: localModel().gb, langs: localModelLangs() };
    return { state: "none" };
  }

  // "Réessayer" under a passage: the same run, over what is still marked.
  articleBody.addEventListener("click", (e) => {
    if (e.target.closest(".translate-retry") && shown) ctx.pick(shown);
  });

  return { translate, clear, state, showing: () => shown };
}

window.__gkTranslateDevice = { createTranslator };
