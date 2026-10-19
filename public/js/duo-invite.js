// "À deux" under a note (/duel/, components/Duel.tsx):
// - "Défier quelqu'un" on a note with two multiple-choice questions or more
//   (`[!quiz]` with `- [x]` choices): a revision duel on those questions;
// - "Lancer un tandem" on a note of Languages - Dialects: an audio call with
//   a friend, the note's pronunciation phrases as shared prompts.
// Both create a room (POST /api/room) and open /duel/ as its host. Only
// where WebRTC exists (and, for the tandem, the microphone API); built here,
// after the build, so Pagefind never indexes it; print hides it.
(function () {
  if (typeof RTCPeerConnection !== "function" || typeof WebSocket !== "function") return;
  const body = document.querySelector(".article-body");
  const m = location.pathname.match(/^\/posts\/(.+?)\/?$/);
  if (!body || !m) return;
  let slug;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    return;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(slug)) return;

  const tt = (k, v) => (window.__i18n && window.__i18n.t ? window.__i18n.t(k, v) : k);
  function txt(tag, cls, key) {
    const el = document.createElement(tag);
    el.className = cls;
    el.textContent = tt(key);
    el.setAttribute("data-i18n", key);
    return el;
  }

  const choiceCards = Array.from(body.querySelectorAll(".callout-quiz.quiz--choice")).filter(
    (c) => c.querySelectorAll(".quiz-choice").length >= 2 && c.querySelector('.quiz-choice[data-ok="1"]'),
  );
  const duel = choiceCards.length >= 2;
  const tandem =
    /(^|\/)languages-dialects\//.test(slug) &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";
  if (!duel && !tandem) return;

  const box = document.createElement("aside");
  box.className = "duo-invite";
  box.setAttribute("data-pagefind-ignore", "");
  box.setAttribute("aria-label", tt("duo.invite.aria"));
  box.setAttribute("data-i18n-aria-label", "duo.invite.aria");

  function row(kind) {
    const r = document.createElement("div");
    r.className = "duo-invite-row";
    const tx = document.createElement("div");
    tx.append(txt("p", "duo-invite-title", `duo.invite.${kind}Title`), txt("p", "duo-invite-text", `duo.invite.${kind}Text`));
    const btn = txt("button", "duo-invite-btn", `duo.invite.${kind}`);
    btn.type = "button";
    const status = document.createElement("p");
    status.className = "duo-invite-status";
    status.setAttribute("aria-live", "polite");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.textContent = tt("duo.creating");
      try {
        const r = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, ref: slug }),
        });
        const j = r.ok ? await r.json() : null;
        if (!j || !j.code || !j.key) throw new Error("room");
        location.href = `/duel/#${j.code}~${j.key}`;
      } catch {
        btn.disabled = false;
        status.textContent = tt("duo.err.create");
      }
    });
    r.append(tx, btn, status);
    return r;
  }

  if (duel) box.append(row("duel"));
  if (tandem) box.append(row("tandem"));
  body.after(box);
})();
