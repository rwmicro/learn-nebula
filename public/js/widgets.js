// Interactive widgets for note pages.
//
// A ```widget:<name> block in the vault becomes
//   <figure class="widget" data-widget="<name>" data-props='{...}'>
// (see rehypeWidgets in lib/markdown.ts). This script replaces the fallback
// paragraph inside each figure with the real thing.
//
// Everything here is plain DOM: the note HTML is static-exported, so there is
// no React on the page to hydrate into. Each builder returns a fragment and is
// responsible for its own listeners; nothing is registered globally.
(function () {
  const figures = document.querySelectorAll(".widget[data-widget]");
  if (!figures.length) return;

  // ---------------------------------------------------------------- helpers

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of children || []) {
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }

  /** A row of clickable bit cells. `groups` splits it into labelled runs. */
  function bitRow(bits, groups, onToggle) {
    const row = el("div", { class: "w-bits" });
    let i = 0;
    for (const g of groups) {
      const cells = el("span", { class: "w-group-bits" });
      for (let k = 0; k < g.len; k++) {
        const idx = i++;
        const b = el(
          "button",
          {
            type: "button",
            class: "w-bit",
            "aria-label": "bit " + idx,
            onclick: () => onToggle(idx),
          },
          [String(bits[idx])],
        );
        if (bits[idx]) b.classList.add("is-on");
        cells.appendChild(b);
      }
      // Label sits in normal flow under its run: a one-bit group (the sign)
      // would otherwise have a label wider than the group it belongs to, and
      // absolute positioning made the two captions collide.
      row.appendChild(
        el("span", { class: "w-group w-group-" + g.kind }, [
          cells,
          el("em", { class: "w-group-label" }, [g.label]),
        ]),
      );
    }
    return row;
  }

  // ------------------------------------------------------- IEEE 754 widget

  /**
   * Exact decimal expansion of a double. Every binary fraction terminates in
   * base 10, so this is finite and exact — which is the whole point: it shows
   * that 0.1 is stored as 0.1000000000000000055511151231257827021181583404541015625
   * rather than as 0.1.
   */
  function exactDecimal(x) {
    if (Number.isNaN(x)) return "NaN";
    if (!Number.isFinite(x)) return x > 0 ? "+∞" : "−∞";
    if (x === 0) return Object.is(x, -0) ? "−0" : "0";

    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, x);
    const hi = dv.getUint32(0);
    const lo = dv.getUint32(4);
    const sign = hi >>> 31 ? "−" : "";
    let exp = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    // Subnormals have no implicit leading 1 and a fixed exponent of 1.
    if (exp === 0) exp = 1;
    else mant |= 1n << 52n;
    const e = exp - 1075; // value = mant × 2^e, exactly

    if (e >= 0) return sign + (mant << BigInt(e)).toString();

    const d = -e;
    const denom = 1n << BigInt(d);
    const int = mant / denom;
    const rem = mant % denom;
    // rem/2^d == (rem × 5^d)/10^d, so the fraction digits are exact.
    let frac = (rem * 5n ** BigInt(d)).toString().padStart(d, "0");
    frac = frac.replace(/0+$/, "");
    return sign + int.toString() + (frac ? "." + frac : "");
  }

  function floatBits(value, width) {
    const dv = new DataView(new ArrayBuffer(8));
    const bytes = width / 8;
    if (width === 32) dv.setFloat32(0, value);
    else dv.setFloat64(0, value);
    const bits = [];
    for (let i = 0; i < bytes; i++) {
      const b = dv.getUint8(i);
      for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1);
    }
    return bits;
  }

  function bitsToFloat(bits, width) {
    const dv = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < width / 8; i++) {
      let b = 0;
      for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
      dv.setUint8(i, b);
    }
    return width === 32 ? dv.getFloat32(0) : dv.getFloat64(0);
  }

  function ieee754(props) {
    const width = props.bits === "64" ? 64 : 32;
    const expLen = width === 32 ? 8 : 11;
    const mantLen = width === 32 ? 23 : 52;
    const bias = width === 32 ? 127 : 1023;

    let bits = floatBits(Number(props.value ?? "0.1"), width);

    const input = el("input", {
      type: "text",
      class: "w-input",
      value: String(props.value ?? "0.1"),
      "aria-label": "valeur décimale",
    });
    const out = el("div", { class: "w-out" });
    const host = el("div", { class: "w-body" });

    function draw() {
      const v = bitsToFloat(bits, width);
      let expRaw = 0;
      for (let i = 1; i <= expLen; i++) expRaw = expRaw * 2 + bits[i];

      const special =
        expRaw === (1 << expLen) - 1
          ? Number.isNaN(v)
            ? "NaN — exposant à 1, mantisse non nulle"
            : "Infini — exposant à 1, mantisse nulle"
          : expRaw === 0
            ? "Dénormalisé — pas de 1 implicite"
            : null;

      host.replaceChildren(
        bitRow(bits, [
          { len: 1, kind: "sign", label: "signe" },
          { len: expLen, kind: "exp", label: "exposant (" + expLen + " bits)" },
          { len: mantLen, kind: "mant", label: "mantisse (" + mantLen + " bits)" },
        ], (i) => {
          bits[i] ^= 1;
          input.value = String(bitsToFloat(bits, width));
          draw();
        }),
      );

      const rows = [
        ["Signe", bits[0] ? "négatif" : "positif"],
        [
          "Exposant",
          expRaw + " − " + bias + " = " + (expRaw === 0 ? 1 - bias : expRaw - bias),
        ],
        ["Valeur stockée, exacte", exactDecimal(v)],
        ["Affichée par le langage", String(v)],
      ];
      if (special) rows.push(["Cas particulier", special]);

      const typed = Number(input.value);
      if (Number.isFinite(typed) && typed !== v) {
        const d = v - typed;
        rows.push([
          "Écart avec la saisie",
          d.toExponential(3) + "  (exact : " + exactDecimal(d) + ")",
        ]);
      }

      out.replaceChildren(
        el(
          "table",
          { class: "w-table" },
          rows.map((r) =>
            el("tr", {}, [
              el("th", {}, [r[0]]),
              el("td", {}, [r[1]]),
            ]),
          ),
        ),
      );
    }

    input.addEventListener("input", () => {
      const v = Number(input.value);
      if (!Number.isNaN(v) || /^\s*nan\s*$/i.test(input.value)) {
        bits = floatBits(v, width);
        draw();
      }
    });

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Valeur ", input]),
        el("span", { class: "w-hint" }, [
          "cliquer un bit le bascule · " + width + " bits",
        ]),
      ]),
      host,
      out,
    ]);
  }

  // ------------------------------------------------- two's complement widget

  function complement2(props) {
    const width = Math.min(32, Math.max(4, Number(props.bits ?? 8)));
    let bits = new Array(width).fill(0);

    function setFrom(n) {
      const mod = 2 ** width;
      let u = ((n % mod) + mod) % mod;
      for (let i = width - 1; i >= 0; i--) {
        bits[i] = u & 1;
        u >>>= 1;
      }
    }
    setFrom(Number(props.value ?? -5));

    const unsignedOf = () => bits.reduce((a, b) => a * 2 + b, 0);
    const signedOf = () => {
      const u = unsignedOf();
      return bits[0] ? u - 2 ** width : u;
    };

    const host = el("div", { class: "w-body" });
    const out = el("div", { class: "w-out" });
    const steps = el("div", { class: "w-steps" });

    function draw() {
      host.replaceChildren(
        bitRow(bits, [
          { len: 1, kind: "sign", label: "bit de signe" },
          { len: width - 1, kind: "mant", label: "valeur (" + (width - 1) + " bits)" },
        ], (i) => {
          bits[i] ^= 1;
          steps.replaceChildren();
          draw();
        }),
      );
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          el("tr", {}, [
            el("th", {}, ["Lu comme non signé"]),
            el("td", {}, [String(unsignedOf())]),
          ]),
          el("tr", {}, [
            el("th", {}, ["Lu comme signé"]),
            el("td", {}, [String(signedOf())]),
          ]),
          el("tr", {}, [
            el("th", {}, ["Plage sur " + width + " bits"]),
            el("td", {}, [
              "non signé 0 … " + (2 ** width - 1) +
                " · signé " + -(2 ** (width - 1)) + " … " + (2 ** (width - 1) - 1),
            ]),
          ]),
        ]),
      );
    }

    /** Shows the invert-then-add-one recipe as three explicit lines. */
    function negate() {
      const before = bits.join("");
      const inverted = bits.map((b) => b ^ 1);
      const asNum = inverted.reduce((a, b) => a * 2 + b, 0);
      setFrom(asNum + 1);
      steps.replaceChildren(
        el("code", {}, [before + "   valeur de départ"]),
        el("code", {}, [inverted.join("") + "   tous les bits inversés"]),
        el("code", {}, [bits.join("") + "   + 1 → l'opposé"]),
      );
      draw();
    }

    function increment() {
      setFrom(unsignedOf() + 1);
      steps.replaceChildren();
      draw();
    }

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("button", { type: "button", class: "w-btn", onclick: negate }, [
          "Inverser puis +1",
        ]),
        el("button", { type: "button", class: "w-btn", onclick: increment }, [
          "+1",
        ]),
        el("span", { class: "w-hint" }, ["cliquer un bit le bascule"]),
      ]),
      host,
      out,
      steps,
    ]);
  }

  // ------------------------------------------------ cache locality widget

  function cacheLocality(props) {
    const n = Math.min(24, Math.max(4, Number(props.size ?? 12)));
    const line = Math.min(n, Math.max(2, Number(props.line ?? 8))); // cells per cache line
    const capacity = Math.max(1, Number(props.capacity ?? 4)); // cache lines held
    let mode = "rows";
    let step = 0;
    let timer = null;

    const grid = el("div", { class: "w-grid" });
    grid.style.setProperty("--n", String(n));
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const c = el("i", { class: "w-cell" });
      cells.push(c);
      grid.appendChild(c);
    }

    const out = el("div", { class: "w-out" });

    /** Linear index, in memory order (row-major), of the k-th access. */
    function order(k) {
      if (mode === "rows") return k;
      const col = Math.floor(k / n);
      const row = k % n;
      return row * n + col;
    }

    function draw() {
      // A real cache holds a bounded number of lines and evicts the least
      // recently used one. Modelling it as unbounded would make the column
      // walk stop missing once every line is in — the opposite of the lesson.
      const loaded = new Map(); // lineId -> last use, insertion-ordered
      let misses = 0;
      for (let k = 0; k < step; k++) {
        const idx = order(k);
        const lineId = Math.floor(idx / line);
        if (loaded.has(lineId)) {
          loaded.delete(lineId); // re-insert to move it to the MRU end
        } else {
          misses++;
          if (loaded.size >= capacity) {
            loaded.delete(loaded.keys().next().value); // evict LRU
          }
        }
        loaded.set(lineId, k);
      }
      for (let i = 0; i < cells.length; i++) {
        cells[i].className = "w-cell";
      }
      for (let k = 0; k < step; k++) cells[order(k)].classList.add("is-read");
      // Shade the lines still resident, so eviction is visible.
      for (const lineId of loaded.keys()) {
        const base = lineId * line;
        for (let j = base; j < Math.min(base + line, cells.length); j++) {
          cells[j].classList.add("is-cached");
        }
      }
      if (step > 0 && step <= cells.length) {
        const idx = order(step - 1);
        cells[idx].classList.add("is-now");
        // Highlight the whole 64-byte line that access pulled in.
        const base = Math.floor(idx / line) * line;
        for (let j = base; j < Math.min(base + line, cells.length); j++) {
          cells[j].classList.add("is-line");
        }
      }
      const ratio = step ? (misses / step) : 0;
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          el("tr", {}, [el("th", {}, ["Accès"]), el("td", {}, [String(step)])]),
          el("tr", {}, [
            el("th", {}, ["Défauts de cache"]),
            el("td", {}, [String(misses)]),
          ]),
          el("tr", {}, [
            el("th", {}, ["Un défaut tous les"]),
            el("td", {}, [
              step && misses ? (step / misses).toFixed(2) + " accès" : "—",
            ]),
          ]),
          el("tr", {}, [
            el("th", {}, ["Trafic mémoire"]),
            el("td", {}, [
              step ? (ratio * 100).toFixed(0) + " % des accès touchent la RAM" : "—",
            ]),
          ]),
        ]),
      );
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      play.textContent = "Lancer";
    }
    function run() {
      if (timer) return stop();
      play.textContent = "Pause";
      timer = setInterval(() => {
        if (step >= cells.length) return stop();
        step++;
        draw();
      }, 40);
    }
    function reset(next) {
      stop();
      if (next) mode = next;
      step = 0;
      draw();
      for (const b of [byRow, byCol]) b.classList.remove("is-active");
      (mode === "rows" ? byRow : byCol).classList.add("is-active");
    }

    const play = el("button", { type: "button", class: "w-btn", onclick: run }, [
      "Lancer",
    ]);
    const byRow = el(
      "button",
      { type: "button", class: "w-btn is-active", onclick: () => reset("rows") },
      ["Ligne par ligne"],
    );
    const byCol = el(
      "button",
      { type: "button", class: "w-btn", onclick: () => reset("cols") },
      ["Colonne par colonne"],
    );

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        byRow,
        byCol,
        play,
        el("span", { class: "w-hint" }, [
          "ligne de cache = " + line + " cases contiguës · cache = " +
            capacity + " lignes, éviction LRU",
        ]),
      ]),
      grid,
      out,
    ]);
  }

  // ------------------------------------------------------- subnetting widget

  function subnet(props) {
    let addr = String(props.value ?? "192.168.10.5");
    let prefix = Number(props.prefix ?? 24);

    const parse = (t) => {
      const m = /^\s*(\d+)\.(\d+)\.(\d+)\.(\d+)\s*(?:\/(\d+))?\s*$/.exec(t);
      if (!m) return null;
      const o = m.slice(1, 5).map(Number);
      if (o.some((x) => x > 255)) return null;
      return {
        n: ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3],
        p: m[5] === undefined ? null : Math.min(32, Number(m[5])),
      };
    };
    const dotted = (n) =>
      [24, 16, 8, 0].map((sh) => (n >>> sh) & 255).join(".");

    const input = el("input", { type: "text", class: "w-input", value: addr });
    input.style.width = "16ch";
    const slider = el("input", {
      type: "range", min: "0", max: "32", value: String(prefix),
      class: "w-range", "aria-label": "longueur du préfixe",
    });
    const host = el("div", { class: "w-body" });
    const out = el("div", { class: "w-out" });

    function draw() {
      const parsed = parse(input.value);
      if (!parsed) {
        out.replaceChildren(el("p", { class: "w-warn" }, ["Adresse invalide."]));
        host.replaceChildren();
        return;
      }
      const ip = parsed.n;
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      const net = (ip & mask) >>> 0;
      const bcast = (net | (~mask >>> 0)) >>> 0;
      const hosts = prefix >= 31 ? 0 : 2 ** (32 - prefix) - 2;

      // 32 bits, split at the prefix so the boundary is a position, not a sum.
      const bits = [];
      for (let i = 31; i >= 0; i--) bits.push((ip >>> i) & 1);
      host.replaceChildren(
        bitRow(bits, [
          { len: prefix, kind: "exp", label: "partie réseau (" + prefix + " bits)" },
          { len: 32 - prefix, kind: "mant", label: "partie hôte (" + (32 - prefix) + " bits)" },
        ].filter((g) => g.len > 0), () => {}),
      );

      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["Masque", dotted(mask) + "  (/" + prefix + ")"],
          ["Adresse réseau", dotted(net)],
          ["Diffusion", prefix >= 31 ? "—" : dotted(bcast)],
          ["Première adresse utilisable", hosts ? dotted(net + 1) : "—"],
          ["Dernière adresse utilisable", hosts ? dotted(bcast - 1) : "—"],
          ["Hôtes adressables", hosts ? hosts.toLocaleString("fr-FR") : "aucun (/31 et /32)"],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])]))),
      );
    }

    input.addEventListener("input", () => {
      const parsed = parse(input.value);
      if (parsed && parsed.p !== null) {
        prefix = parsed.p;
        slider.value = String(prefix);
      }
      draw();
    });
    slider.addEventListener("input", () => {
      prefix = Number(slider.value);
      draw();
    });

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Adresse ", input]),
        el("label", {}, ["Préfixe ", slider]),
        el("span", { class: "w-hint" }, ["bouger le curseur déplace la frontière"]),
      ]),
      host,
      out,
    ]);
  }

  // -------------------------------------------------- hash avalanche widget

  function hashAvalanche(props) {
    const algo = (props.algo ?? "SHA-256").toUpperCase();
    const input = el("input", {
      type: "text", class: "w-input", value: String(props.value ?? "bonjour"),
    });
    input.style.width = "22ch";
    const out = el("div", { class: "w-out" });
    const grid = el("div", { class: "w-hashbits" });

    const enc = new TextEncoder();
    const hex = (buf) =>
      [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

    async function digest(text) {
      // Only available in a secure context (HTTPS or localhost).
      if (!globalThis.crypto || !crypto.subtle) {
        throw new Error(
          "Le hachage réclame un contexte sécurisé (HTTPS) ; indisponible ici.",
        );
      }
      const d = await crypto.subtle.digest(algo, enc.encode(text));
      return new Uint8Array(d);
    }

    /** Flips the last character, so the two inputs differ by one symbol. */
    function nudge(text) {
      if (!text) return "a";
      const last = text.slice(-1);
      const next = last === "z" ? "y" : String.fromCharCode(last.charCodeAt(0) + 1);
      return text.slice(0, -1) + next;
    }

    async function draw() {
      const a = input.value;
      const b = nudge(a);
      let ha, hb;
      try {
        [ha, hb] = await Promise.all([digest(a), digest(b)]);
      } catch (e) {
        grid.replaceChildren();
        out.replaceChildren(el("p", { class: "w-warn" }, [e.message || String(e)]));
        return;
      }
      let diff = 0;
      const cells = [];
      for (let i = 0; i < ha.length; i++) {
        const x = ha[i] ^ hb[i];
        for (let k = 7; k >= 0; k--) {
          const bit = (x >> k) & 1;
          diff += bit;
          cells.push(el("i", { class: "w-hbit" + (bit ? " is-flip" : "") }));
        }
      }
      grid.replaceChildren(...cells);
      const total = ha.length * 8;
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          [algo + " de « " + a + " »", hex(ha)],
          [algo + " de « " + b + " »", hex(hb)],
          ["Bits modifiés", diff + " sur " + total + "  (" + ((diff / total) * 100).toFixed(1) + " %)"],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", { class: "w-mono" }, [r[1]])]))),
      );
    }

    input.addEventListener("input", draw);
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Texte ", input]),
        el("span", { class: "w-hint" }, [
          "comparé au même texte dont le dernier caractère change d'un cran",
        ]),
      ]),
      grid,
      out,
    ]);
  }

  // ------------------------------------------------------- encoding widget

  function encodage(props) {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const input = el("textarea", { class: "w-area", rows: "2" });
    input.value = String(props.value ?? "Bonjour <monde>");
    const out = el("div", { class: "w-out" });

    const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
    const toB64 = (b) => btoa(String.fromCharCode(...b));

    function draw() {
      const text = input.value;
      const bytes = enc.encode(text);
      const url = encodeURIComponent(text);
      const html = text.replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      const rows = [
        ["Octets UTF-8", bytes.length + " octets pour " + [...text].length + " caractères"],
        ["Hexadécimal", toHex(bytes)],
        ["Base64", toB64(bytes)],
        ["URL (pourcent)", url],
        ["Double URL", encodeURIComponent(url)],
        ["Entités HTML", html],
      ];
      out.replaceChildren(
        el("table", { class: "w-table" }, rows.map((r) =>
          el("tr", {}, [el("th", {}, [r[0]]), el("td", { class: "w-mono" }, [r[1]])]))),
      );
    }

    input.addEventListener("input", draw);
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("span", { class: "w-hint" }, [
          "les mêmes octets sous plusieurs habillages — comparer URL et double URL",
        ]),
      ]),
      input,
      out,
    ]);
  }

  // ------------------------------------------------------ endianness widget

  function boutisme(props) {
    const widths = [16, 32, 64];
    let width = widths.includes(Number(props.bits)) ? Number(props.bits) : 32;
    const input = el("input", { type: "text", class: "w-input", value: String(props.value ?? "0x0A0B0C0D") });
    input.style.width = "16ch";
    const sel = el("select", { class: "w-input" }, widths.map((w) =>
      el("option", w === width ? { value: String(w), selected: "selected" } : { value: String(w) }, [w + " bits"])));
    const out = el("div", { class: "w-out" });

    function bytesOf() {
      let v;
      try { v = BigInt(input.value.trim()); } catch { return null; }
      const n = width / 8;
      const mask = (1n << BigInt(width)) - 1n;
      v &= mask;
      const b = [];
      for (let i = n - 1; i >= 0; i--) b.push(Number((v >> BigInt(i * 8)) & 0xffn));
      return b; // big-endian order
    }

    function draw() {
      const be = bytesOf();
      if (!be) {
        out.replaceChildren(el("p", { class: "w-warn" }, ["Valeur invalide (essayer 0x0A0B0C0D ou 168496141)."]));
        return;
      }
      const le = [...be].reverse();
      const hexes = (a) => a.map((x) => x.toString(16).toUpperCase().padStart(2, "0"));
      const cells = (a) => el("span", { class: "w-group-bits" },
        a.map((x, i) => el("b", { class: "w-byte" }, [
          hexes(a)[i], el("em", {}, ["@" + i]),
        ])));
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          el("tr", {}, [el("th", {}, ["Petit-boutiste (x86-64)"]), el("td", {}, [cells(le)])]),
          el("tr", {}, [el("th", {}, ["Grand-boutiste (réseau)"]), el("td", {}, [cells(be)])]),
          el("tr", {}, [el("th", {}, ["Valeur"]), el("td", { class: "w-mono" }, [
            "0x" + hexes(be).join("") + "  =  " + BigInt("0x" + hexes(be).join("")).toString(),
          ])]),
        ]),
      );
    }

    input.addEventListener("input", draw);
    sel.addEventListener("change", () => { width = Number(sel.value); draw(); });
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Valeur ", input]),
        el("label", {}, ["Largeur ", sel]),
        el("span", { class: "w-hint" }, ["@0 est l'adresse la plus basse"]),
      ]),
      out,
    ]);
  }

  // ----------------------------------------------------------- regex widget

  function regex(props) {
    const pat = el("input", { type: "text", class: "w-input", value: String(props.pattern ?? "\\b(\\w+)@(\\w+\\.\\w+)\\b") });
    pat.style.width = "26ch";
    const flags = el("input", { type: "text", class: "w-input", value: String(props.flags ?? "g") });
    flags.style.width = "5ch";
    const text = el("textarea", { class: "w-area", rows: "3" });
    // Props are one line each, so a multi-line sample is written with \n.
    text.value = String(props.text ?? "alice@example.com et bob@test.fr").replace(
      /\\n/g,
      "\n",
    );
    const view = el("div", { class: "w-highlight" });
    const out = el("div", { class: "w-out" });

    function draw() {
      let re;
      try {
        re = new RegExp(pat.value, flags.value.includes("g") ? flags.value : flags.value + "g");
      } catch (e) {
        view.replaceChildren();
        out.replaceChildren(el("p", { class: "w-warn" }, ["Motif invalide : " + e.message]));
        return;
      }
      const src = text.value;
      const parts = [];
      const rows = [];
      let last = 0, m, guard = 0;
      while ((m = re.exec(src)) !== null && guard++ < 500) {
        if (m.index > last) parts.push(document.createTextNode(src.slice(last, m.index)));
        parts.push(el("mark", {}, [m[0] || "∅"]));
        last = m.index + (m[0].length || 1);
        rows.push([String(rows.length + 1), m[0], m.slice(1).map((g, i) => "$" + (i + 1) + "=" + g).join("  ") || "—"]);
        if (m[0] === "") re.lastIndex++;
      }
      parts.push(document.createTextNode(src.slice(last)));
      view.replaceChildren(...parts);
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          el("tr", {}, [el("th", {}, ["Correspondances"]), el("td", {}, [String(rows.length)])]),
          ...rows.slice(0, 8).map((r) =>
            el("tr", {}, [el("th", {}, ["№ " + r[0]]), el("td", { class: "w-mono" }, [r[1] + "   " + r[2]])])),
        ]),
      );
    }

    for (const n of [pat, flags, text]) n.addEventListener("input", draw);
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Motif ", pat]),
        el("label", {}, ["Options ", flags]),
      ]),
      text,
      view,
      out,
    ]);
  }

  /** Minimal SVG element helper — same shape as el(), different namespace. */
  function svg(tag, attrs, children) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    for (const c of children || []) n.appendChild(c);
    return n;
  }

  // -------------------------------------------- decision threshold widget

  function seuil(props) {
    // A fixed, deterministic sample: the lesson is the trade-off, so the data
    // must not move between renders. Simple LCG rather than Math.random().
    const N = 200;
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pts = [];
    for (let i = 0; i < N; i++) {
      const positive = i % 3 === 0; // a third of the sample is positive
      // Scores overlap on purpose: a perfectly separable set has no trade-off.
      const base = positive ? 0.62 : 0.38;
      const score = Math.max(0, Math.min(1, base + (rnd() + rnd() + rnd() - 1.5) * 0.28));
      pts.push({ positive, score });
    }

    let th = Number(props.threshold ?? 0.5);
    const slider = el("input", {
      type: "range", min: "0", max: "1", step: "0.01",
      value: String(th), class: "w-range", "aria-label": "seuil de décision",
    });
    const plot = el("div", { class: "w-plot" });
    const out = el("div", { class: "w-out" });

    function draw() {
      let tp = 0, fp = 0, fn = 0, tn = 0;
      for (const p of pts) {
        const pred = p.score >= th;
        if (p.positive && pred) tp++;
        else if (!p.positive && pred) fp++;
        else if (p.positive && !pred) fn++;
        else tn++;
      }
      const prec = tp + fp ? tp / (tp + fp) : 0;
      const rec = tp + fn ? tp / (tp + fn) : 0;
      const f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0;

      // Two stacked histograms, negatives above the axis, positives below.
      const W = 420, H = 120, bins = 40;
      const hp = new Array(bins).fill(0), hn = new Array(bins).fill(0);
      for (const p of pts) {
        const b = Math.min(bins - 1, Math.floor(p.score * bins));
        (p.positive ? hp : hn)[b]++;
      }
      const top = Math.max(...hp, ...hn, 1);
      const bars = [];
      for (let b = 0; b < bins; b++) {
        const x = (b / bins) * W;
        const w = W / bins - 1;
        bars.push(svg("rect", {
          x, y: H / 2 - (hn[b] / top) * (H / 2 - 4), width: w,
          height: (hn[b] / top) * (H / 2 - 4), fill: "#ccc",
        }));
        bars.push(svg("rect", {
          x, y: H / 2, width: w, height: (hp[b] / top) * (H / 2 - 4), fill: "#9fc0dd",
        }));
      }
      const xs = th * W;
      bars.push(svg("line", { x1: xs, y1: 0, x2: xs, y2: H, stroke: "#003366", "stroke-width": 2 }));
      plot.replaceChildren(
        svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img",
          "aria-label": "distribution des scores et seuil" }, bars),
        el("div", { class: "w-legend" }, [
          el("span", { class: "w-key w-key-neg" }, ["négatifs"]),
          el("span", { class: "w-key w-key-pos" }, ["positifs"]),
          el("span", { class: "w-hint" }, ["seuil = " + th.toFixed(2)]),
        ]),
      );

      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["Vrais positifs / Faux positifs", tp + " / " + fp],
          ["Faux négatifs / Vrais négatifs", fn + " / " + tn],
          ["Précision", prec.toFixed(3) + "  — parmi les prédits positifs, combien le sont"],
          ["Rappel", rec.toFixed(3) + "  — parmi les positifs réels, combien sont trouvés"],
          ["F1", f1.toFixed(3)],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])]))),
      );
    }

    slider.addEventListener("input", () => { th = Number(slider.value); draw(); });
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Seuil ", slider]),
        el("span", { class: "w-hint" }, ["monter le seuil gagne en précision et perd en rappel"]),
      ]),
      plot,
      out,
    ]);
  }

  // ----------------------------------------------------- complexity widget

  function complexite(props) {
    const CLASSES = [
      ["O(1)", () => 1],
      ["O(log n)", (n) => Math.log2(n)],
      ["O(n)", (n) => n],
      ["O(n log n)", (n) => n * Math.log2(n)],
      ["O(n²)", (n) => n * n],
      ["O(2ⁿ)", (n) => 2 ** n],
    ];
    let e = Number(props.exp ?? 10); // n = 2^e, so the slider spans decades
    const slider = el("input", {
      type: "range", min: "1", max: "26", value: String(e), class: "w-range",
      "aria-label": "taille de l'entrée",
    });
    const out = el("div", { class: "w-out" });
    const cross = el("div", { class: "w-out" });

    const human = (x) => {
      if (!Number.isFinite(x)) return "∞";
      if (x < 1e4) return x.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
      if (x < 1e15) return x.toExponential(2).replace("e+", " × 10^");
      return "10^" + Math.round(Math.log10(x));
    };

    function draw() {
      const n = 2 ** e;
      const rows = CLASSES.map(([name, f]) => {
        const ops = f(n);
        // A billion simple operations a second is the usual back-of-envelope.
        const sec = ops / 1e9;
        // 2^n overflows to Infinity well before the slider runs out, and
        // "Infinity années" reads like a bug rather than like the point.
        const time = !Number.isFinite(sec) ? "hors de portée"
          : sec < 1e-3 ? "< 1 ms"
          : sec < 1 ? (sec * 1e3).toFixed(0) + " ms"
          : sec < 3600 ? sec.toFixed(1) + " s"
          : sec < 3.15e7 ? (sec / 3600).toFixed(1) + " h"
          : (sec / 3.15e7).toExponential(1) + " années";
        return el("tr", {}, [
          el("th", {}, [name]),
          el("td", { class: "w-mono" }, [human(ops)]),
          el("td", {}, [time]),
        ]);
      });
      out.replaceChildren(
        el("table", { class: "w-table w-table-3" }, [
          el("tr", {}, [
            el("th", {}, ["n = " + n.toLocaleString("fr-FR")]),
            el("td", {}, [el("em", {}, ["opérations"])]),
            el("td", {}, [el("em", {}, ["à 10⁹ op/s"])]),
          ]),
          ...rows,
        ]),
      );

      // The point the note's own callout makes: constants decide on small n.
      const a = 50 * n * Math.log2(n); // un O(n log n) mal implémenté
      const b = 2 * n * n; // un O(n²) soigné
      cross.replaceChildren(
        el("p", { class: "w-note" }, [
          "Avec des constantes réalistes — 50·n·log n contre 2·n² — le O(n log n) effectue " +
            human(a) + " opérations et le O(n²) " + human(b) + " : " +
            (a < b ? "l'asymptotique l'emporte déjà." : "le O(n²) est encore le plus rapide."),
        ]),
      );
    }

    slider.addEventListener("input", () => { e = Number(slider.value); draw(); });
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Taille n ", slider]),
        el("span", { class: "w-hint" }, ["n varie de 2 à 67 millions"]),
      ]),
      out,
      cross,
    ]);
  }

  // ---------------------------------------------------- truth table widget

  /**
   * Recursive-descent evaluator for a small boolean grammar:
   *   or  := and ('|' and)*        and := not ('&' not)*
   *   not := '!' not | atom        atom := VAR | '(' or ')'
   * '^' is xor, handled at the or level. Variables are single letters.
   */
  function boolParse(src) {
    let i = 0;
    const ws = () => { while (src[i] === " ") i++; };
    const peek = () => { ws(); return src[i]; };
    const vars = new Set();
    function atom() {
      ws();
      if (src[i] === "(") { i++; const e = orExpr(); ws(); if (src[i] !== ")") throw new Error("parenthèse fermante manquante"); i++; return e; }
      const m = /^[A-Za-z]/.exec(src.slice(i));
      if (!m) throw new Error("variable attendue en position " + i);
      const v = src[i++]; vars.add(v);
      return (env) => env[v];
    }
    function notExpr() {
      ws();
      if (src[i] === "!" || src[i] === "¬") { i++; const e = notExpr(); return (env) => !e(env); }
      return atom();
    }
    function andExpr() {
      let e = notExpr();
      while (peek() === "&" || peek() === "·" || peek() === "∧") { i++; const r = notExpr(); const l = e; e = (env) => l(env) && r(env); }
      return e;
    }
    function orExpr() {
      let e = andExpr();
      for (;;) {
        const c = peek();
        if (c === "|" || c === "+" || c === "∨") { i++; const r = andExpr(); const l = e; e = (env) => l(env) || r(env); }
        else if (c === "^" || c === "⊕") { i++; const r = andExpr(); const l = e; e = (env) => l(env) !== r(env); }
        else break;
      }
      return e;
    }
    const fn = orExpr();
    ws();
    if (i < src.length) throw new Error("caractère inattendu : " + src[i]);
    return { fn, vars: [...vars].sort() };
  }

  function tableVerite(props) {
    const input = el("input", { type: "text", class: "w-input", value: String(props.expr ?? "!(A & B)") });
    input.style.width = "24ch";
    const cmp = el("input", { type: "text", class: "w-input", value: String(props.compare ?? "!A | !B") });
    cmp.style.width = "24ch";
    const out = el("div", { class: "w-out" });

    function draw() {
      let a, b;
      try { a = boolParse(input.value); } catch (e) {
        out.replaceChildren(el("p", { class: "w-warn" }, ["Expression 1 : " + e.message])); return;
      }
      try { b = cmp.value.trim() ? boolParse(cmp.value) : null; } catch (e) {
        out.replaceChildren(el("p", { class: "w-warn" }, ["Expression 2 : " + e.message])); return;
      }
      const vars = [...new Set([...a.vars, ...(b ? b.vars : [])])].sort();
      if (vars.length > 4) {
        out.replaceChildren(el("p", { class: "w-warn" }, ["Quatre variables au maximum."])); return;
      }
      const rows = [];
      let same = true;
      for (let n = 0; n < 2 ** vars.length; n++) {
        const env = {};
        vars.forEach((v, k) => { env[v] = !!((n >> (vars.length - 1 - k)) & 1); });
        const r1 = !!a.fn(env);
        const r2 = b ? !!b.fn(env) : null;
        if (b && r1 !== r2) same = false;
        rows.push(
          el("tr", {}, [
            ...vars.map((v) => el("td", { class: "w-mono" }, [env[v] ? "1" : "0"])),
            el("td", { class: "w-mono" + (r1 ? " is-true" : "") }, [r1 ? "1" : "0"]),
            ...(b ? [el("td", { class: "w-mono" + (r2 ? " is-true" : "") }, [r2 ? "1" : "0"])] : []),
          ]),
        );
      }
      out.replaceChildren(
        el("table", { class: "w-table w-truth" }, [
          el("tr", {}, [
            ...vars.map((v) => el("th", {}, [v])),
            el("th", {}, [input.value]),
            ...(b ? [el("th", {}, [cmp.value])] : []),
          ]),
          ...rows,
        ]),
        b ? el("p", { class: "w-note" }, [
          same ? "Les deux expressions sont équivalentes." : "Les deux expressions diffèrent.",
        ]) : el("span", {}, []),
      );
    }

    for (const n of [input, cmp]) n.addEventListener("input", draw);
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Expression ", input]),
        el("label", {}, ["Comparer à ", cmp]),
      ]),
      el("p", { class: "w-hint" }, ["opérateurs : ! & | ^ et parenthèses"]),
      out,
    ]);
  }

  // ----------------------------------------------------- stack frame widget

  function cadrePile(props) {
    // A call with more arguments than registers carry, so the stack actually
    // gets used for arguments — the case the note describes.
    const BASE = 0x7ffd000;
    const PROG = [
      { t: "bar: push rbp", d: "sauvegarde la base de l'appelant", push: "ancien rbp" },
      { t: "      mov rbp, rsp", d: "installe la nouvelle base", setbp: true },
      { t: "      push 8", d: "8e argument, empilé en premier", push: "arg 8" },
      { t: "      push 7", d: "7e argument", push: "arg 7" },
      { t: "      call foo", d: "empile l'adresse de retour et saute", push: "adresse de retour" },
      { t: "foo:  push rbp", d: "prologue : base de bar sauvegardée", push: "rbp de bar" },
      { t: "      mov rbp, rsp", d: "base du cadre de foo", setbp: true },
      { t: "      sub rsp, 16", d: "réserve deux variables locales", push: "local 2", push2: "local 1" },
      { t: "      leave", d: "rsp ← rbp puis pop rbp", leave: true },
      { t: "      ret", d: "dépile l'adresse de retour et y saute", pop: 1 },
    ];

    let step = 0;
    const view = el("div", { class: "w-stack" });
    const note = el("p", { class: "w-note" });
    const list = el("ol", { class: "w-prog" });

    function state() {
      const cells = []; // index 0 = top of stack (lowest address)
      let bp = null;
      for (let k = 0; k < step; k++) {
        const s = PROG[k];
        if (s.push) cells.unshift(s.push);
        if (s.push2) cells.unshift(s.push2);
        if (s.setbp) bp = cells.length;
        if (s.leave) {
          // rsp ← rbp discards the locals, then pop rbp restores the caller's.
          while (cells.length > bp) cells.shift();
          cells.shift();
          bp = null;
        }
        if (s.pop) for (let j = 0; j < s.pop; j++) cells.shift();
      }
      return { cells, bp };
    }

    function draw() {
      const { cells, bp } = state();
      const rows = cells.map((c, i) => {
        const addr = BASE - (cells.length - i) * 8;
        const marks = [];
        if (i === 0) marks.push(el("b", { class: "w-reg" }, ["rsp"]));
        if (bp !== null && i === cells.length - bp) marks.push(el("b", { class: "w-reg" }, ["rbp"]));
        return el("div", { class: "w-slot" }, [
          el("span", { class: "w-addr" }, ["0x" + addr.toString(16)]),
          el("span", { class: "w-slot-v" }, [c]),
          el("span", { class: "w-slot-r" }, marks),
        ]);
      });
      view.replaceChildren(
        rows.length ? el("div", {}, rows) : el("p", { class: "w-hint" }, ["pile vide"]),
        el("p", { class: "w-hint" }, ["la pile croît vers le bas : le sommet est l'adresse la plus basse"]),
      );
      note.textContent = step ? PROG[step - 1].d : "Avancer pas à pas dans l'appel.";
      list.replaceChildren(...PROG.map((s, i) =>
        el("li", { class: i === step - 1 ? "is-now" : "" }, [s.t])));
    }

    const back = el("button", { type: "button", class: "w-btn",
      onclick: () => { step = Math.max(0, step - 1); draw(); } }, ["Précédent"]);
    const fwd = el("button", { type: "button", class: "w-btn",
      onclick: () => { step = Math.min(PROG.length, step + 1); draw(); } }, ["Suivant"]);
    const reset = el("button", { type: "button", class: "w-btn",
      onclick: () => { step = 0; draw(); } }, ["Début"]);

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [reset, back, fwd]),
      el("div", { class: "w-split" }, [list, view]),
      note,
    ]);
  }

  // -------------------------------------------------------- pipeline widget

  function pipeline(props) {
    const STAGES = ["IF", "ID", "EX", "MEM", "WB"];
    const PROG = [
      { t: "ld  r1, [r2]", w: "r1", r: ["r2"], load: true },
      { t: "sub r4, r1, r5", w: "r4", r: ["r1", "r5"] },
      { t: "and r6, r4, r7", w: "r6", r: ["r4", "r7"] },
      { t: "or  r8, r6, r9", w: "r8", r: ["r6", "r9"] },
    ];
    let forwarding = props.forwarding !== "false";
    const grid = el("div", { class: "w-pipe" });
    const out = el("div", { class: "w-out" });

    /**
     * In-order issue. An operand is ready after WB without forwarding, and
     * right after EX with it — which is exactly what forwarding buys.
     */
    function schedule() {
      const ready = {}; // register -> cycle from which its value can be read
      const rows = [];
      let prevIF = -1;
      for (const ins of PROG) {
        let ifC = prevIF + 1;
        let exC = ifC + 2;
        for (const r of ins.r) {
          if (ready[r] !== undefined) exC = Math.max(exC, ready[r]);
        }
        // Stages are contiguous, so a late EX pushes IF/ID later too.
        ifC = Math.max(ifC, exC - 2);
        const stalls = ifC - (prevIF + 1);
        if (ins.w) {
          ready[ins.w] = forwarding
            ? exC + (ins.load ? 2 : 1) // load: après MEM ; ALU : après EX
            : exC + 3; // sans renvoi, il faut attendre l'écriture du registre
        }
        rows.push({ ins, ifC, stalls });
        prevIF = ifC;
      }
      return rows;
    }

    function draw() {
      const rows = schedule();
      const total = Math.max(...rows.map((r) => r.ifC + 5));
      const head = [el("span", { class: "w-pipe-label" }, [""])];
      for (let c = 0; c < total; c++) head.push(el("span", { class: "w-pipe-c" }, [String(c + 1)]));
      const body = [el("div", { class: "w-pipe-row" }, head)];
      for (const r of rows) {
        const cells = [el("span", { class: "w-pipe-label" }, [r.ins.t])];
        for (let c = 0; c < total; c++) {
          const k = c - r.ifC;
          const stage = k >= 0 && k < 5 ? STAGES[k] : "";
          cells.push(el("span", { class: "w-pipe-c" + (stage ? " is-" + stage.toLowerCase() : "") }, [stage]));
        }
        body.push(el("div", { class: "w-pipe-row" }, cells));
      }
      grid.replaceChildren(...body);

      const stalls = rows.reduce((a, r) => a + r.stalls, 0);
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["Cycles au total", String(total)],
          ["Cycles perdus en suspension", String(stalls)],
          ["Idéal sans dépendance", String(PROG.length + 4)],
          ["Renvoi de résultat", forwarding
            ? "actif — le résultat de l'ALU se réutilise au cycle suivant, mais une lecture mémoire n'arrive qu'après l'étage MEM : cet aléa-là subsiste"
            : "inactif — chaque dépendance impose d'attendre l'écriture du registre"],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])]))),
      );
    }

    const toggle = el("button", { type: "button", class: "w-btn",
      onclick: () => { forwarding = !forwarding; toggle.classList.toggle("is-active", forwarding); draw(); } },
      ["Renvoi de résultat"]);
    if (forwarding) toggle.classList.add("is-active");

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        toggle,
        el("span", { class: "w-hint" }, [
          "chaîne de dépendances r1 → r4 → r6 ; la première est une lecture mémoire",
        ]),
      ]),
      grid,
      out,
    ]);
  }

  // --------------------------------------------------------------- mounting

  const BUILDERS = {
    ieee754: ieee754,
    complement2: complement2,
    "cache-locality": cacheLocality,
    subnet: subnet,
    "hash-avalanche": hashAvalanche,
    encodage: encodage,
    boutisme: boutisme,
    regex: regex,
    seuil: seuil,
    complexite: complexite,
    "table-verite": tableVerite,
    "cadre-pile": cadrePile,
    pipeline: pipeline,
  };

  for (const fig of figures) {
    const name = fig.getAttribute("data-widget");
    const build = BUILDERS[name];
    if (!build) continue;
    let props = {};
    try {
      props = JSON.parse(fig.getAttribute("data-props") || "{}");
    } catch {
      // Malformed props shouldn't take the widget down; defaults are fine.
    }
    try {
      const node = build(props);
      fig.replaceChildren(node);
      fig.classList.add("is-live");
    } catch (e) {
      // Leave the fallback paragraph in place rather than an empty figure.
      console.warn("widget " + name + ":", e);
    }
  }
})();
