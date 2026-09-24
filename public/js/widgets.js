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

  // ------------------------------------------------------- interval widget

  /**
   * Just intonation against equal temperament. The point is audible, not
   * visual: a tempered fifth beats against a just one, and the beat rate is
   * the difference of the two frequencies.
   */
  function intervalle(props) {
    const RATIOS = [
      ["Unisson", 0, 1 / 1], ["Seconde mineure", 1, 16 / 15],
      ["Seconde majeure", 2, 9 / 8], ["Tierce mineure", 3, 6 / 5],
      ["Tierce majeure", 4, 5 / 4], ["Quarte juste", 5, 4 / 3],
      ["Triton", 6, 45 / 32], ["Quinte juste", 7, 3 / 2],
      ["Sixte mineure", 8, 8 / 5], ["Sixte majeure", 9, 5 / 3],
      ["Septième mineure", 10, 16 / 9], ["Septième majeure", 11, 15 / 8],
      ["Octave", 12, 2 / 1],
    ];
    const base = Number(props.base ?? 261.63); // do médium
    let idx = RATIOS.findIndex((r) => r[0] === (props.interval ?? "Quinte juste"));
    if (idx < 0) idx = 7;

    let ctx = null, nodes = [];
    const stop = () => {
      for (const n of nodes) { try { n.stop(); } catch { /* déjà arrêté */ } }
      nodes = [];
      play.textContent = "Écouter";
      play.classList.remove("is-active");
    };
    function tone(freq, gain) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g).connect(ctx.destination);
      o.start();
      nodes.push(o);
      return o;
    }
    function start(mode) {
      stop();
      // An AudioContext may only be created from a user gesture.
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { note.textContent = "Web Audio indisponible dans ce navigateur."; return; }
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      const [, demi, ratio] = RATIOS[idx];
      const fJuste = base * ratio;
      const fTemp = base * 2 ** (demi / 12);
      tone(base, 0.12);
      if (mode !== "temp") tone(fJuste, 0.12);
      if (mode !== "juste") tone(fTemp, 0.12);
      play.textContent = "Arrêter";
      play.classList.add("is-active");
      setTimeout(stop, 4000);
    }

    const sel = el("select", { class: "w-input" }, RATIOS.map((r, i) =>
      el("option", i === idx ? { value: String(i), selected: "selected" } : { value: String(i) }, [r[0]])));
    const out = el("div", { class: "w-out" });
    const note = el("p", { class: "w-note" });

    function draw() {
      const [nom, demi, ratio] = RATIOS[idx];
      const fJuste = base * ratio;
      const fTemp = base * 2 ** (demi / 12);
      const cents = 1200 * Math.log2(ratio / 2 ** (demi / 12));
      const beats = Math.abs(fJuste - fTemp);
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["Rapport juste", ratio.toFixed(4) + (Number.isInteger(ratio * 15) ? "" : "") + "   (" + nom.toLowerCase() + ")"],
          ["Fréquence juste", fJuste.toFixed(2) + " Hz"],
          ["Fréquence tempérée", fTemp.toFixed(2) + " Hz"],
          ["Écart", cents.toFixed(1) + " cents"],
          ["Battements si les deux sonnent", beats < 0.05 ? "aucun" : beats.toFixed(2) + " par seconde"],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])]))),
      );
      // Judge audibility by the beat rate, not by cents: a fifth differs by
      // only ~2 cents yet beats about twice a second, which is the classic
      // demonstration. Below roughly one beat every ten seconds, nothing is
      // perceptible.
      note.textContent = beats < 0.1
        ? "Les deux versions coïncident : aucun battement perceptible."
        : "Jouées ensemble, les deux versions produisent " + beats.toFixed(2) +
          " battement" + (beats >= 2 ? "s" : "") + " par seconde — cette pulsation lente " +
          "est la trace audible du tempérament, et c'est ce que l'accordeur écoute.";
    }

    const play = el("button", { type: "button", class: "w-btn",
      onclick: () => (nodes.length ? stop() : start("deux")) }, ["Écouter"]);
    const pj = el("button", { type: "button", class: "w-btn", onclick: () => start("juste") }, ["Juste seul"]);
    const pt = el("button", { type: "button", class: "w-btn", onclick: () => start("temp") }, ["Tempéré seul"]);
    sel.addEventListener("change", () => { idx = Number(sel.value); stop(); draw(); });

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Intervalle ", sel]), play, pj, pt,
        el("span", { class: "w-hint" }, ["fondamentale à " + base + " Hz"]),
      ]),
      out, note,
    ]);
  }

  // ------------------------------------------------------ chessboard widget

  function echiquier(props) {
    const GLYPH = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
                    k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
    const start = String(props.fen ?? "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1");
    // Moves are given in coordinate form (e2e4), one per `moves` prop, space separated.
    const moves = String(props.moves ?? "").trim().split(/\s+/).filter(Boolean);
    let step = 0;

    function board(fen) {
      const rows = fen.split(" ")[0].split("/");
      const b = [];
      for (const r of rows) {
        const line = [];
        for (const c of r) {
          if (/\d/.test(c)) for (let k = 0; k < Number(c); k++) line.push("");
          else line.push(c);
        }
        b.push(line);
      }
      return b;
    }
    const sq = (s) => [8 - Number(s[1]), s.charCodeAt(0) - 97]; // e4 -> [4,4]

    function at(n) {
      const b = board(start);
      for (let k = 0; k < n && k < moves.length; k++) {
        const m = moves[k];
        const [fr, fc] = sq(m.slice(0, 2));
        const [tr, tc] = sq(m.slice(2, 4));
        b[tr][tc] = b[fr][fc];
        b[fr][fc] = "";
      }
      return b;
    }

    const grid = el("div", { class: "w-board" });
    const out = el("div", { class: "w-out" });

    function draw() {
      const b = at(step);
      const last = step > 0 && moves[step - 1] ? [sq(moves[step - 1].slice(0, 2)), sq(moves[step - 1].slice(2, 4))] : null;
      const cells = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const dark = (r + c) % 2 === 1;
          const isLast = last && last.some(([lr, lc]) => lr === r && lc === c);
          cells.push(el("i", { class: "w-sq" + (dark ? " is-dark" : "") + (isLast ? " is-last" : "") },
            [b[r][c] ? GLYPH[b[r][c]] || "" : ""]));
        }
      }
      grid.replaceChildren(...cells);
      out.replaceChildren(el("p", { class: "w-note" }, [
        moves.length
          ? "Coup " + step + " sur " + moves.length + (step ? " — " + moves[step - 1] : " — position initiale")
          : "Position fixe.",
      ]));
    }

    const ctrls = moves.length ? [
      el("button", { type: "button", class: "w-btn", onclick: () => { step = 0; draw(); } }, ["Début"]),
      el("button", { type: "button", class: "w-btn", onclick: () => { step = Math.max(0, step - 1); draw(); } }, ["Précédent"]),
      el("button", { type: "button", class: "w-btn", onclick: () => { step = Math.min(moves.length, step + 1); draw(); } }, ["Suivant"]),
    ] : [el("span", { class: "w-hint" }, ["position d'étude"])];

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, ctrls),
      grid,
      out,
    ]);
  }

  // ------------------------------------------------- vowel trapezoid widget

  /**
   * The articulatory space is continuous: a vowel is a position of the tongue,
   * not an entry in a list. A table cannot show that, a trapezoid can.
   * Vowels are given as `sym:backness,height,rounded` — backness and height in
   * 0..1 — so a note supplies whichever inventory it describes.
   */
  function trapezeVocalique(props) {
    const DEF = "i:0,0,0 y:0,0,1 e:0.08,0.33,0 ø:0.08,0.33,1 ɛ:0.16,0.66,0 œ:0.16,0.66,1 a:0.24,1,0 ɑ:0.76,1,0 ɔ:0.84,0.66,1 o:0.92,0.33,1 u:1,0,1 ɯ:1,0,0";
    const items = String(props.vowels ?? DEF).trim().split(/\s+/).map((t) => {
      const [sym, rest] = t.split(":");
      const [b, h, r] = (rest || "0,0,0").split(",").map(Number);
      return { sym, b, h, r: !!r };
    });
    const out = el("div", { class: "w-out" });
    const plot = el("div", { class: "w-trap" });

    const W = 420, H = 300, P = 34;
    function draw(sel) {
      const kids = [];
      // Trapezoid outline: the mouth narrows towards the back at close height.
      const x = (b, h) => P + b * (W - 2 * P) * (1 - 0.28 * (1 - h)) + 0.28 * (1 - h) * (W - 2 * P) * 0;
      const pts = [[P, P], [W - P, P], [W - P * 1.6, H - P], [P * 1.6, H - P]];
      kids.push(svg("polygon", {
        points: pts.map((p) => p.join(",")).join(" "),
        fill: "#fcfcfc", stroke: "#ccc",
      }));
      for (const lbl of [["fermée", P], ["ouverte", H - P]]) {
        kids.push(svg("text", { x: 4, y: lbl[1] + 4, "font-size": "10", fill: "#6f6f6f" }, []));
        kids[kids.length - 1].textContent = lbl[0];
      }
      for (const v of items) {
        // Interpolate along the trapezoid so points sit inside the outline.
        const yy = P + v.h * (H - 2 * P);
        const left = P + v.h * (P * 0.6);
        const right = W - P - v.h * (P * 0.6);
        const xx = left + v.b * (right - left);
        const g = svg("g", { class: "w-vowel" + (sel === v.sym ? " is-sel" : "") });
        g.appendChild(svg("circle", { cx: xx, cy: yy, r: 11,
          fill: v.r ? "#003366" : "#f0f7ff", stroke: "#003366" }));
        const t = svg("text", { x: xx, y: yy + 4, "text-anchor": "middle",
          "font-size": "12", fill: v.r ? "#fcfcfc" : "#003366" }, []);
        t.textContent = v.sym;
        g.appendChild(t);
        g.addEventListener("click", () => draw(v.sym));
        g.style.cursor = "pointer";
        kids.push(g);
      }
      plot.replaceChildren(svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%",
        role: "img", "aria-label": "trapèze vocalique" }, kids));

      const v = items.find((z) => z.sym === sel);
      out.replaceChildren(
        el("div", { class: "w-legend" }, [
          el("span", { class: "w-key w-key-pos" }, ["arrondie"]),
          el("span", { class: "w-key w-key-neg" }, ["non arrondie"]),
          el("span", { class: "w-hint" }, ["horizontale : antérieur → postérieur · verticale : fermé → ouvert"]),
        ]),
        v ? el("table", { class: "w-table" }, [
          ["Voyelle", v.sym],
          ["Aperture", v.h < 0.25 ? "fermée" : v.h < 0.55 ? "mi-fermée" : v.h < 0.85 ? "mi-ouverte" : "ouverte"],
          ["Lieu", v.b < 0.34 ? "antérieure" : v.b < 0.67 ? "centrale" : "postérieure"],
          ["Labialisation", v.r ? "arrondie" : "non arrondie"],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])])))
          : el("p", { class: "w-note" }, ["Cliquer une voyelle pour ses traits articulatoires."]),
      );
    }

    draw(null);
    return el("div", { class: "w-root" }, [plot, out]);
  }

  // -------------------------------------------------------- Punnett widget

  function punnett(props) {
    const p1 = el("input", { type: "text", class: "w-input", value: String(props.parent1 ?? "Aa") });
    const p2 = el("input", { type: "text", class: "w-input", value: String(props.parent2 ?? "Aa") });
    for (const n of [p1, p2]) n.style.width = "7ch";
    const dom = el("input", { type: "text", class: "w-input", value: String(props.dominant ?? "A") });
    dom.style.width = "4ch";
    const out = el("div", { class: "w-out" });

    /** Gametes of a genotype: every combination of one allele per locus. */
    function gametes(g) {
      const loci = g.match(/X.|Y|../g) || [];
      let out = [""];
      for (const l of loci) {
        const next = [];
        for (const pre of out) for (const a of (l === "Y" ? ["Y"] : [l[0], l[1]])) next.push(pre + a);
        out = next;
      }
      return out;
    }

    function draw() {
      const a = gametes(p1.value.trim());
      const b = gametes(p2.value.trim());
      if (!a.length || !b.length) {
        out.replaceChildren(el("p", { class: "w-warn" }, ["Génotypes attendus, par exemple Aa, XHXh, XhY."]));
        return;
      }
      const tally = {};
      const rows = [el("tr", {}, [el("th", {}, [""]), ...b.map((g) => el("th", {}, [g]))])];
      for (const ga of a) {
        const cells = [el("th", {}, [ga])];
        for (const gb of b) {
          const child = [...ga + gb].sort((x, y) =>
            (x === dom.value ? -1 : 1) - (y === dom.value ? -1 : 1) || x.localeCompare(y)).join("");
          tally[child] = (tally[child] || 0) + 1;
          cells.push(el("td", { class: "w-mono" }, [child]));
        }
        rows.push(el("tr", {}, cells));
      }
      const total = a.length * b.length;
      out.replaceChildren(
        el("table", { class: "w-table w-truth" }, rows),
        el("table", { class: "w-table" }, Object.entries(tally)
          .sort((x, y) => y[1] - x[1])
          .map(([g, n]) => el("tr", {}, [
            el("th", { class: "w-mono" }, [g]),
            el("td", {}, [n + " / " + total + "  —  " + ((n / total) * 100).toFixed(0) + " %"]),
          ]))),
      );
    }

    for (const n of [p1, p2, dom]) n.addEventListener("input", draw);
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Parent 1 ", p1]),
        el("label", {}, ["Parent 2 ", p2]),
        el("label", {}, ["Allèle dominant ", dom]),
      ]),
      el("p", { class: "w-hint" }, ["autosomique : Aa × Aa · lié à l'X : XHXh × XHY"]),
      out,
    ]);
  }

  // ---------------------------------------------------- 2x2 matrix widget

  /**
   * A 2x2 matrix is a transformation of the plane, not a box of numbers: the
   * determinant is the factor the unit square's area is multiplied by, and the
   * eigenvectors are the directions the transform leaves on their own line.
   */
  function matrice2d(props) {
    const v = (k, d) => Number(props[k] ?? d);
    let m = [v("a", 1), v("b", 1), v("c", 0), v("d", 2)]; // a b / c d
    const fields = ["a", "b", "c", "d"].map((k, i) => {
      const n = el("input", { type: "number", step: "0.1", class: "w-input", value: String(m[i]) });
      n.style.width = "5.5ch";
      n.addEventListener("input", () => { m[i] = Number(n.value) || 0; draw(); });
      return n;
    });
    const plot = el("div", { class: "w-plot" });
    const out = el("div", { class: "w-out" });

    const S = 260, C = S / 2, U = 42; // pixels per unit
    const P = (x, y) => [C + x * U, C - y * U];

    function draw() {
      const [a, b, c, d] = m;
      const det = a * d - b * c;
      const tr = a + c === 0 ? a + d : a + d;
      const kids = [];
      // Original grid, faint.
      for (let i = -3; i <= 3; i++) {
        kids.push(svg("line", { x1: P(i, -3)[0], y1: P(i, -3)[1], x2: P(i, 3)[0], y2: P(i, 3)[1], stroke: "#eee" }));
        kids.push(svg("line", { x1: P(-3, i)[0], y1: P(-3, i)[1], x2: P(3, i)[0], y2: P(3, i)[1], stroke: "#eee" }));
      }
      // Transformed grid.
      const T = (x, y) => P(a * x + b * y, c * x + d * y);
      for (let i = -3; i <= 3; i++) {
        const A = T(i, -3), B = T(i, 3), Cc = T(-3, i), D = T(3, i);
        kids.push(svg("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: "#cfe0f0" }));
        kids.push(svg("line", { x1: Cc[0], y1: Cc[1], x2: D[0], y2: D[1], stroke: "#cfe0f0" }));
      }
      // Unit square, before and after.
      const sq0 = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => P(x, y));
      const sq1 = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => T(x, y));
      kids.push(svg("polygon", { points: sq0.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#ccc", "stroke-dasharray": "3 3" }));
      kids.push(svg("polygon", { points: sq1.map((p) => p.join(",")).join(" "), fill: "#f0f7ff", "fill-opacity": "0.8", stroke: "#003366" }));
      // Basis images.
      for (const [x, y, col] of [[1, 0, "#003366"], [0, 1, "#2d6cc0"]]) {
        const q = T(x, y);
        kids.push(svg("line", { x1: C, y1: C, x2: q[0], y2: q[1], stroke: col, "stroke-width": 2 }));
      }
      // Real eigenvectors, when the discriminant allows.
      const disc = (a - d) ** 2 + 4 * b * c;
      let eig = null;
      if (disc >= 0) {
        const r = Math.sqrt(disc);
        const l1 = (a + d + r) / 2, l2 = (a + d - r) / 2;
        eig = [l1, l2];
        for (const l of [l1, l2]) {
          // (A - lI)v = 0 -> v = (b, l - a) or (l - d, c)
          let vx = b, vy = l - a;
          if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) { vx = l - d; vy = c; }
          const n = Math.hypot(vx, vy) || 1;
          const [ux, uy] = [(vx / n) * 3, (vy / n) * 3];
          const A = P(-ux, -uy), B = P(ux, uy);
          kids.push(svg("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: "#b8740f", "stroke-dasharray": "5 3" }));
        }
      }
      plot.replaceChildren(svg("svg", { viewBox: `0 0 ${S} ${S}`, width: "100%", role: "img",
        "aria-label": "transformation du plan" }, kids));

      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["Déterminant", det.toFixed(3) + (Math.abs(det) < 1e-9
            ? "  — le plan s'écrase sur une droite"
            : "  — l'aire du carré unité est multipliée par " + Math.abs(det).toFixed(3) +
              (det < 0 ? ", avec renversement d'orientation" : ""))],
          ["Trace", (a + d).toFixed(3)],
          ["Valeurs propres", eig
            ? eig.map((x) => x.toFixed(3)).join("  et  ")
            : "complexes — aucune direction n'est préservée, la transformation tourne"],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])]))),
        el("div", { class: "w-legend" }, [
          el("span", { class: "w-hint" }, ["tirets orange : directions propres · pointillés gris : carré unité de départ"]),
        ]),
      );
    }

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("span", {}, ["["]), fields[0], fields[1], el("span", {}, ["]"]),
        el("span", {}, ["["]), fields[2], fields[3], el("span", {}, ["]"]),
        el("span", { class: "w-hint" }, ["lignes du haut puis du bas"]),
      ]),
      plot, out,
    ]);
  }

  // -------------------------------------------------------- logistic map

  function logistique(props) {
    let r = Number(props.r ?? 3.2);
    const slider = el("input", { type: "range", min: "2.4", max: "4", step: "0.001",
      value: String(r), class: "w-range", "aria-label": "paramètre r" });
    const plotOrbit = el("div", { class: "w-plot" });
    const plotBif = el("div", { class: "w-plot" });
    const out = el("div", { class: "w-out" });

    // The bifurcation diagram never changes, so it is drawn once into a canvas.
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 280;
    canvas.style.width = "100%";
    canvas.style.border = "1px solid #ccc";
    (function bifurcation() {
      const g = canvas.getContext("2d");
      if (!g) return;
      g.fillStyle = "#fcfcfc"; g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = "rgba(0,51,102,0.5)";
      for (let px = 0; px < canvas.width; px++) {
        const rr = 2.4 + (px / canvas.width) * 1.6;
        let x = 0.5;
        for (let i = 0; i < 200; i++) x = rr * x * (1 - x); // régime transitoire
        for (let i = 0; i < 120; i++) {
          x = rr * x * (1 - x);
          g.fillRect(px, canvas.height - x * canvas.height, 1, 1);
        }
      }
    })();
    const marker = el("div", { class: "w-marker" });
    plotBif.replaceChildren(el("div", { class: "w-canvas-wrap" }, [canvas, marker]));

    function draw() {
      // Orbit: the first 60 iterates, so the period is countable by eye.
      const W = 420, H = 150, N = 60;
      let x = 0.5;
      const pts = [];
      for (let i = 0; i < 200; i++) x = r * x * (1 - x);
      for (let i = 0; i < N; i++) { x = r * x * (1 - x); pts.push(x); }
      const kids = [svg("line", { x1: 0, y1: H, x2: W, y2: H, stroke: "#ccc" })];
      pts.forEach((v, i) => {
        const px = (i / (N - 1)) * W;
        kids.push(svg("circle", { cx: px, cy: H - v * H, r: 2.2, fill: "#003366" }));
        if (i) {
          const q = (i - 1) / (N - 1) * W;
          kids.push(svg("line", { x1: q, y1: H - pts[i - 1] * H, x2: px, y2: H - v * H, stroke: "#cfe0f0" }));
        }
      });
      plotOrbit.replaceChildren(svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img",
        "aria-label": "orbite" }, kids));
      marker.style.left = (((r - 2.4) / 1.6) * 100).toFixed(2) + "%";

      // Detect the period by looking for a repeat among the settled values.
      const tail = pts.slice(-32);
      let period = 0;
      for (let p = 1; p <= 16; p++) {
        let ok = true;
        for (let i = 0; i + p < tail.length; i++) if (Math.abs(tail[i] - tail[i + p]) > 1e-4) { ok = false; break; }
        if (ok) { period = p; break; }
      }
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["r", r.toFixed(3)],
          ["Régime", period === 0 ? "apériodique — chaos"
            : period === 1 ? "point fixe" : "cycle de période " + period],
          ["Repères", "r < 3 : point fixe · 3 : période 2 · 3,449 : période 4 · 3,569… : chaos"],
        ].map((z) => el("tr", {}, [el("th", {}, [z[0]]), el("td", {}, [z[1]])]))),
      );
    }

    slider.addEventListener("input", () => { r = Number(slider.value); draw(); });
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["r ", slider]),
        el("span", { class: "w-hint" }, ["xₙ₊₁ = r·xₙ·(1 − xₙ)"]),
      ]),
      plotOrbit,
      plotBif,
      out,
    ]);
  }

  // ------------------------------------------------------ game theory widget

  function theorieJeux(props) {
    // Payoffs as "a,b" per cell: row player first, column player second.
    const def = ["3,3", "0,5", "5,0", "1,1"]; // dilemme du prisonnier
    const cells = (props.payoffs ? String(props.payoffs).split(/\s*\|\s*/) : def);
    const labels = {
      r1: props.r1 ?? "Coopérer", r2: props.r2 ?? "Trahir",
      c1: props.c1 ?? "Coopérer", c2: props.c2 ?? "Trahir",
    };
    const inputs = cells.slice(0, 4).map((v) => {
      const n = el("input", { type: "text", class: "w-input", value: v });
      n.style.width = "7ch";
      n.addEventListener("input", draw);
      return n;
    });
    const out = el("div", { class: "w-out" });
    const grid = el("div", { class: "w-payoff" });

    function parse() {
      return inputs.map((n) => {
        const [a, b] = n.value.split(",").map((x) => Number(x.trim()));
        return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0];
      });
    }

    function draw() {
      const p = parse(); // [RC, RT, TC, TT] en ordre ligne-major
      const M = [[p[0], p[1]], [p[2], p[3]]];
      // Pure Nash equilibria: no player gains by deviating alone.
      const nash = [];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const rowOk = M[i][j][0] >= M[1 - i][j][0];
        const colOk = M[i][j][1] >= M[i][1 - j][1];
        if (rowOk && colOk) nash.push([i, j]);
      }
      grid.replaceChildren(
        el("table", { class: "w-table w-truth" }, [
          el("tr", {}, [el("th", {}, [""]), el("th", {}, [labels.c1]), el("th", {}, [labels.c2])]),
          el("tr", {}, [el("th", {}, [labels.r1]),
            el("td", { class: nash.some(([i, j]) => i === 0 && j === 0) ? "is-true" : "" }, [inputs[0]]),
            el("td", { class: nash.some(([i, j]) => i === 0 && j === 1) ? "is-true" : "" }, [inputs[1]])]),
          el("tr", {}, [el("th", {}, [labels.r2]),
            el("td", { class: nash.some(([i, j]) => i === 1 && j === 0) ? "is-true" : "" }, [inputs[2]]),
            el("td", { class: nash.some(([i, j]) => i === 1 && j === 1) ? "is-true" : "" }, [inputs[3]])]),
        ]),
      );
      const names = nash.map(([i, j]) =>
        "(" + (i ? labels.r2 : labels.r1) + ", " + (j ? labels.c2 : labels.c1) + ")");
      // Pareto: is some cell at least as good for both, strictly better for one?
      const flat = [[0, 0], [0, 1], [1, 0], [1, 1]];
      const pareto = nash.map(([i, j]) => flat.some(([x, y]) =>
        M[x][y][0] >= M[i][j][0] && M[x][y][1] >= M[i][j][1] &&
        (M[x][y][0] > M[i][j][0] || M[x][y][1] > M[i][j][1])));
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["Équilibres de Nash en stratégies pures", names.length ? names.join("  ·  ") : "aucun — il en existe un en stratégies mixtes"],
          ["Optimal au sens de Pareto", names.length
            ? (pareto.some(Boolean) ? "non — un autre résultat serait meilleur pour tous" : "oui")
            : "—"],
        ].map((z) => el("tr", {}, [el("th", {}, [z[0]]), el("td", {}, [z[1]])]))),
      );
    }

    draw();
    return el("div", { class: "w-root" }, [
      el("p", { class: "w-hint" }, ["chaque case : gain de la ligne, gain de la colonne · les cases surlignées sont des équilibres"]),
      grid,
      out,
    ]);
  }

  // ------------------------------------------------ Turkish vowel harmony

  /**
   * Turkish suffixes have no fixed vowel: it is derived from the stem. The
   * note states the rule as two lookup tables; here it runs, so the reader
   * sees one suffix take four shapes rather than memorising four suffixes.
   */
  function harmonieVocalique(props) {
    const BACK = "aıou", FRONT = "eiöü", VOWELS = BACK + FRONT;
    const VOICELESS = "çfhkpsşt"; // consonnes sourdes : d → t
    const lastVowel = (w) => {
      for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i])) return w[i];
      return null;
    };
    const isVowel = (c) => VOWELS.includes(c);
    // Two-way harmony (a/e) and four-way harmony (ı/i/u/ü).
    const A = (v) => (BACK.includes(v) ? "a" : "e");
    const I = (v) => ({ a: "ı", "ı": "ı", e: "i", i: "i", o: "u", u: "u", "ö": "ü", "ü": "ü" })[v];

    // Each suffix declares how to build itself from the current form.
    const SUF = [
      { id: "pluriel", nom: "pluriel", build: (w) => ({ add: "l" + A(lastVowel(w)) + "r", rule: "harmonie en deux temps : a/e" }) },
      { id: "poss1", nom: "possessif 1ʳᵉ pers.", build: (w) => {
          const v = lastVowel(w);
          return isVowel(w.slice(-1))
            ? { add: "m", rule: "radical en voyelle : pas de voyelle de liaison" }
            : { add: I(v) + "m", rule: "harmonie en quatre temps : ı/i/u/ü" };
        } },
      { id: "locatif", nom: "locatif (« dans »)", build: (w) => {
          const v = lastVowel(w);
          const d = VOICELESS.includes(w.slice(-1)) ? "t" : "d";
          return { add: d + A(v), rule: d === "t" ? "harmonie a/e + assourdissement d → t" : "harmonie a/e" };
        } },
      { id: "ablatif", nom: "ablatif (« depuis »)", build: (w) => {
          const v = lastVowel(w);
          const d = VOICELESS.includes(w.slice(-1)) ? "t" : "d";
          return { add: d + A(v) + "n", rule: d === "t" ? "harmonie a/e + assourdissement" : "harmonie a/e" };
        } },
      { id: "genitif", nom: "génitif (« de »)", build: (w) => {
          const v = lastVowel(w);
          return isVowel(w.slice(-1))
            ? { add: "n" + I(v) + "n", rule: "radical en voyelle : consonne de liaison n" }
            : { add: I(v) + "n", rule: "harmonie en quatre temps" };
        } },
      { id: "accusatif", nom: "accusatif (défini)", build: (w) => {
          const v = lastVowel(w);
          return isVowel(w.slice(-1))
            ? { add: "y" + I(v), rule: "radical en voyelle : consonne de liaison y" }
            : { add: I(v), rule: "harmonie en quatre temps" };
        } },
    ];

    let stem = String(props.stem ?? "ev");
    let chain = [];
    const input = el("input", { type: "text", class: "w-input", value: stem });
    input.style.width = "10ch";
    const out = el("div", { class: "w-out" });
    const steps = el("div", { class: "w-steps" });

    function draw() {
      let w = input.value.trim().toLowerCase() || "ev";
      const lines = [];
      for (const id of chain) {
        const s = SUF.find((x) => x.id === id);
        const { add, rule } = s.build(w);
        lines.push({ before: w, add, after: w + add, nom: s.nom, rule });
        w += add;
      }
      steps.replaceChildren(...lines.map((l) =>
        el("div", { class: "w-step" }, [
          el("code", {}, [l.before + " + " + l.add + " → " + l.after]),
          el("em", {}, [l.nom + " · " + l.rule]),
        ])));
      const v = lastVowel(w);
      out.replaceChildren(
        el("p", { class: "w-result" }, [w]),
        el("table", { class: "w-table" }, [
          ["Dernière voyelle", v ? v + (BACK.includes(v) ? "  (postérieure)" : "  (antérieure)") : "—"],
          ["Prochain suffixe en a/e", v ? A(v) : "—"],
          ["Prochain suffixe en ı/i/u/ü", v ? I(v) : "—"],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])]))),
      );
    }

    input.addEventListener("input", draw);
    const btns = SUF.map((s) => el("button", { type: "button", class: "w-btn",
      onclick: () => { chain.push(s.id); draw(); } }, ["+ " + s.nom]));
    const reset = el("button", { type: "button", class: "w-btn",
      onclick: () => { chain = []; draw(); } }, ["Effacer"]);
    const presets = ["ev", "araba", "göz", "kitap", "yol"].map((w) =>
      el("button", { type: "button", class: "w-btn", onclick: () => { input.value = w; chain = []; draw(); } }, [w]));

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [el("label", {}, ["Radical ", input]), ...presets]),
      el("div", { class: "w-controls" }, [...btns, reset]),
      steps,
      out,
    ]);
  }

  // -------------------------------------------------------- tone contours

  /**
   * Pitch contours drawn from Chao tone letters, plus the sandhi rules the
   * tables cannot express: a rule that rewrites a tone in context.
   */
  function ton(props) {
    const TONES = {
      1: { chao: [5, 5], nom: "haut et soutenu", mark: "ā" },
      2: { chao: [3, 5], nom: "montant", mark: "á" },
      3: { chao: [2, 1, 4], nom: "descendant puis montant", mark: "ǎ" },
      4: { chao: [5, 1], nom: "descendant bref", mark: "à" },
      0: { chao: [3], nom: "neutre, atone", mark: "a" },
    };
    const input = el("input", { type: "text", class: "w-input",
      value: String(props.syllables ?? "ni3 hao3") });
    input.style.width = "18ch";
    const plot = el("div", { class: "w-plot" });
    const out = el("div", { class: "w-out" });

    function parse() {
      return input.value.trim().split(/\s+/).filter(Boolean).map((t) => {
        const m = /^([a-züÜ]+)([0-4]?)$/i.exec(t);
        return m ? { syl: m[1], tone: Number(m[2] || 0) } : { syl: t, tone: 0 };
      });
    }

    /** Sandhi: 3+3 -> 2+3, and 不/一 before a fourth tone. */
    function sandhi(list) {
      const out = list.map((x) => ({ ...x, changed: false }));
      for (let i = 0; i < out.length - 1; i++) {
        if (out[i].tone === 3 && out[i + 1].tone === 3) {
          out[i] = { ...out[i], tone: 2, changed: true, why: "troisième ton suivi d'un troisième → deuxième" };
        }
        if (out[i].syl.toLowerCase() === "bu" && out[i + 1].tone === 4) {
          out[i] = { ...out[i], tone: 2, changed: true, why: "bù devant un quatrième ton → bú" };
        }
        if (out[i].syl.toLowerCase() === "yi" && out[i + 1].tone === 4) {
          out[i] = { ...out[i], tone: 2, changed: true, why: "yī devant un quatrième ton → yí" };
        }
      }
      return out;
    }

    function contour(list, label) {
      const W = 90 * Math.max(1, list.length), H = 120, P = 16;
      const kids = [];
      for (let lvl = 1; lvl <= 5; lvl++) {
        const y = H - P - ((lvl - 1) / 4) * (H - 2 * P);
        kids.push(svg("line", { x1: 0, y1: y, x2: W, y2: y,
          stroke: lvl === 1 || lvl === 5 ? "#ccc" : "#eee" }));
      }
      list.forEach((t, i) => {
        const c = TONES[t.tone] || TONES[0];
        const x0 = i * 90 + 14, span = 62;
        const pts = c.chao.map((lvl, k) => {
          const x = x0 + (c.chao.length === 1 ? span / 2 : (k / (c.chao.length - 1)) * span);
          const y = H - P - ((lvl - 1) / 4) * (H - 2 * P);
          return x + "," + y;
        }).join(" ");
        kids.push(svg(c.chao.length === 1 ? "circle" : "polyline",
          c.chao.length === 1
            ? { cx: x0 + span / 2, cy: H - P - 0.5 * (H - 2 * P), r: 4, fill: "#6f6f6f" }
            : { points: pts, fill: "none", stroke: t.changed ? "#b8740f" : "#003366", "stroke-width": 3 }));
        const lab = svg("text", { x: x0 + span / 2, y: H - 2, "text-anchor": "middle",
          "font-size": "12", fill: t.changed ? "#b8740f" : "#111" }, []);
        lab.textContent = t.syl + (t.tone || "");
        kids.push(lab);
      });
      // A <figure>/<figcaption> here would inherit the article's figure rules
      // (border, centring) and read as an input box; a plain caption avoids it.
      return el("div", { class: "w-tone" }, [
        el("p", { class: "w-hint" }, [label]),
        svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": label }, kids),
      ]);
    }

    function draw() {
      const base = parse();
      const after = sandhi(base);
      const changed = after.filter((t) => t.changed);
      plot.replaceChildren(
        contour(base, "Tons écrits"),
        changed.length ? contour(after, "Tons réellement prononcés") : el("span", {}, []),
      );
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ...base.map((t, i) => el("tr", {}, [
            el("th", {}, [t.syl + (t.tone || "")]),
            el("td", {}, [(TONES[t.tone] || TONES[0]).nom +
              (after[i].changed ? "  →  prononcé " + after[i].tone + " : " + after[i].why : "")]),
          ])),
        ]),
        changed.length
          ? el("p", { class: "w-note" }, ["Le ton écrit n'est pas le ton prononcé : c'est le sandhi, et il ne s'entend que dans la chaîne."])
          : el("p", { class: "w-note" }, ["Aucun sandhi ici. Essayer « ni3 hao3 » ou « bu4 shi4 »."]),
      );
    }

    input.addEventListener("input", draw);
    const ex = ["ni3 hao3", "bu4 shi4", "ma1 ma2 ma3 ma4", "yi4 qi3"].map((e) =>
      el("button", { type: "button", class: "w-btn", onclick: () => { input.value = e; draw(); } }, [e]));
    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [el("label", {}, ["Syllabes ", input]), ...ex]),
      plot,
      out,
    ]);
  }

  // ------------------------------------------------------ Arabic root widget

  /**
   * Arabic derives a whole family of words by threading three root consonants
   * through fixed patterns. The note says recognising a root lets you guess an
   * unknown word; here the derivation runs, so the mechanism is visible rather
   * than the result listed.
   */
  function racineArabe(props) {
    const PATTERNS = [
      { ar: "{1}َ{2}َ{3}َ", tr: "{1}a{2}a{3}a", nom: "فَعَلَ", sens: "verbe accompli — « il a … »" },
      { ar: "يَ{1}ْ{2}ُ{3}ُ", tr: "ya{1}{2}u{3}u", nom: "يَفْعُلُ", sens: "verbe inaccompli — « il fait »" },
      { ar: "{1}َا{2}ِ{3}", tr: "{1}ā{2}i{3}", nom: "فَاعِل", sens: "celui qui fait — agent" },
      { ar: "مَ{1}ْ{2}ُو{3}", tr: "ma{1}{2}ū{3}", nom: "مَفْعُول", sens: "ce qui est fait — patient" },
      { ar: "مَ{1}ْ{2}َ{3}", tr: "ma{1}{2}a{3}", nom: "مَفْعَل", sens: "lieu où l'on fait" },
      { ar: "{1}ِ{2}َا{3}", tr: "{1}i{2}ā{3}", nom: "فِعَال", sens: "nom concret, souvent l'objet" },
      { ar: "{1}َ{2}َّا{3}", tr: "{1}a{2}{2}ā{3}", nom: "فَعَّال", sens: "métier, ou sens intensif" },
      { ar: "تَ{1}ْ{2}ِي{3}", tr: "ta{1}{2}ī{3}", nom: "تَفْعِيل", sens: "nom d'action, forme II" },
      { ar: "اِسْتِ{1}ْ{2}َا{3}", tr: "isti{1}{2}ā{3}", nom: "اِسْتِفْعَال", sens: "nom d'action, forme X — « demander à »" },
    ];
    const PRESETS = [
      ["كتب", "k t b", "écrire"], ["درس", "d r s", "étudier"],
      ["علم", "ʿ l m", "savoir"], ["حكم", "ḥ k m", "juger"], ["فتح", "f t ḥ", "ouvrir"],
    ];
    let ar = String(props.root ?? "كتب");
    let tr = String(props.translit ?? "k t b");

    const inAr = el("input", { type: "text", class: "w-input", value: ar, dir: "rtl" });
    const inTr = el("input", { type: "text", class: "w-input", value: tr });
    inAr.style.width = "7ch"; inTr.style.width = "9ch";
    const out = el("div", { class: "w-out" });

    const fill = (tpl, parts) => tpl.replace(/\{([123])\}/g, (_, k) => parts[Number(k) - 1] ?? "?");

    function draw() {
      const A = [...inAr.value.trim()].filter((c) => /\p{L}/u.test(c)).slice(0, 3);
      const T = inTr.value.trim().split(/[\s-]+/).filter(Boolean).slice(0, 3);
      if (A.length < 3) {
        out.replaceChildren(el("p", { class: "w-warn" }, ["Trois consonnes attendues, par exemple كتب."]));
        return;
      }
      out.replaceChildren(
        el("table", { class: "w-table w-roots" }, PATTERNS.map((p) =>
          el("tr", {}, [
            el("th", { class: "w-ar" }, [p.nom]),
            el("td", { class: "w-ar w-ar-big", dir: "rtl" }, [fill(p.ar, A)]),
            el("td", { class: "w-mono" }, [T.length === 3 ? fill(p.tr, T) : "—"]),
            el("td", {}, [p.sens]),
          ]))),
        el("p", { class: "w-note" }, [
          "Les trois mêmes consonnes, dans le même ordre, traversées par des schèmes différents : " +
          "c'est ce qui permet de deviner qu'un mot inconnu bâti sur " + A.join("") +
          " a quelque chose à voir avec le sens de la racine.",
        ]),
      );
    }

    for (const n of [inAr, inTr]) n.addEventListener("input", draw);
    const presets = PRESETS.map(([a, t, sens]) =>
      el("button", { type: "button", class: "w-btn",
        onclick: () => { inAr.value = a; inTr.value = t; draw(); } }, [a + " · " + sens]));

    draw();
    return el("div", { class: "w-root" }, [
      el("div", { class: "w-controls" }, [
        el("label", {}, ["Racine ", inAr]),
        el("label", {}, ["Translittération ", inTr]),
      ]),
      el("div", { class: "w-controls" }, presets),
      out,
    ]);
  }

  // ---------------------------------------------------------- abugida widget

  /**
   * In an abugida a consonant already carries an inherent /a/; a vowel sign
   * replaces it. A table lists the resulting forms, which hides that they are
   * assembled — so here the two pieces are picked and the glyph is composed.
   */
  function abugida(props) {
    const CONS = [
      ["क", "ka"], ["ख", "kha"], ["ग", "ga"], ["च", "ca"], ["छ", "cha"],
      ["ज", "ja"], ["ट", "ṭa"], ["त", "ta"], ["थ", "tha"], ["द", "da"],
      ["न", "na"], ["प", "pa"], ["फ", "pha"], ["ब", "ba"], ["म", "ma"],
      ["य", "ya"], ["र", "ra"], ["ल", "la"], ["व", "va"], ["स", "sa"],
      ["ह", "ha"],
    ];
    const MATRA = [
      ["", "a", "voyelle inhérente, aucun signe"],
      ["ा", "ā", "mātrā ा"], ["ि", "i", "mātrā ि, écrite à gauche"],
      ["ी", "ī", "mātrā ी"], ["ु", "u", "mātrā ु, sous la consonne"],
      ["ू", "ū", "mātrā ू"], ["े", "e", "mātrā े, au-dessus"],
      ["ै", "ai", "mātrā ै"], ["ो", "o", "mātrā ो"], ["ौ", "au", "mātrā ौ"],
      ["्", "∅", "virāma ्, supprime la voyelle"],
    ];
    let ci = 0, mi = 0;
    const view = el("div", { class: "w-glyph" });
    const gridC = el("div", { class: "w-chars" });
    const gridM = el("div", { class: "w-chars" });
    const out = el("div", { class: "w-out" });

    function draw() {
      const [c, ct] = CONS[ci];
      const [m, mt, note] = MATRA[mi];
      view.replaceChildren(
        el("b", { class: "w-glyph-parts" }, [c, el("i", {}, ["+"]), m || "∅"]),
        el("b", { class: "w-glyph-out" }, [c + m]),
      );
      gridC.replaceChildren(...CONS.map(([g], i) =>
        el("button", { type: "button", class: "w-char" + (i === ci ? " is-active" : ""),
          onclick: () => { ci = i; draw(); } }, [g])));
      gridM.replaceChildren(...MATRA.map(([g, t], i) =>
        el("button", { type: "button", class: "w-char" + (i === mi ? " is-active" : ""),
          onclick: () => { mi = i; draw(); } }, [g ? "◌" + g : "◌"])));
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["Consonne", c + "  —  " + ct + ", elle porte déjà un /a/"],
          ["Signe vocalique", (m || "aucun") + "  —  " + note],
          ["Syllabe obtenue", c + m + "  —  " + ct.replace(/a$/, "") + (mt === "∅" ? "" : mt)],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])]))),
      );
    }

    draw();
    return el("div", { class: "w-root" }, [
      view,
      el("p", { class: "w-hint" }, ["consonnes"]), gridC,
      el("p", { class: "w-hint" }, ["signes vocaliques (mātrā)"]), gridM,
      out,
    ]);
  }

  // ------------------------------------------------------- word order widget

  function ordreDesMots(props) {
    const LANGS = [
      { l: "Français", o: "SVO", S: "Marie", V: "mange", O: "la pomme" },
      { l: "Anglais", o: "SVO", S: "Mary", V: "eats", O: "the apple" },
      { l: "Mandarin", o: "SVO", S: "玛丽", V: "吃", O: "苹果" },
      { l: "Espagnol", o: "SVO", S: "María", V: "come", O: "la manzana" },
      { l: "Turc", o: "SOV", S: "Meryem", V: "yiyor", O: "elmayı" },
      { l: "Hindi", o: "SOV", S: "मरियम", V: "खाती है", O: "सेब" },
      { l: "Japonais", o: "SOV", S: "マリーが", V: "食べる", O: "りんごを" },
      { l: "Arabe classique", o: "VSO", S: "مريم", V: "تأكل", O: "التفاحة" },
      { l: "Irlandais", o: "VSO", S: "Máire", V: "itheann", O: "an t-úll" },
    ];
    let sel = 0;
    const row = el("div", { class: "w-order" });
    const out = el("div", { class: "w-out" });
    const picker = el("div", { class: "w-controls" });

    function draw() {
      const L = LANGS[sel];
      const CLS = { S: "w-sujet", V: "w-verbe", O: "w-objet" };
      const NOM = { S: "sujet", V: "verbe", O: "objet" };
      row.replaceChildren(...[...L.o].map((k) =>
        el("span", { class: "w-cst " + CLS[k] }, [
          el("b", {}, [L[k]]),
          el("em", {}, [NOM[k]]),
        ])));
      picker.replaceChildren(...LANGS.map((x, i) =>
        el("button", { type: "button", class: "w-btn" + (i === sel ? " is-active" : ""),
          onclick: () => { sel = i; draw(); } }, [x.l])));
      const counts = LANGS.reduce((a, x) => { a[x.o] = (a[x.o] || 0) + 1; return a; }, {});
      out.replaceChildren(
        el("table", { class: "w-table" }, [
          ["Ordre", L.o],
          ["Glose", "Marie mange la pomme"],
          ["Dans cet échantillon", Object.entries(counts).map(([o, n]) => o + " : " + n).join("  ·  ")],
        ].map((r) => el("tr", {}, [el("th", {}, [r[0]]), el("td", {}, [r[1]])]))),
        el("p", { class: "w-note" }, [
          "SOV et SVO couvrent à eux deux plus de huit langues du monde sur dix. " +
          "Ce qui change n'est pas le sens mais la place : le sujet précède presque toujours l'objet, " +
          "c'est la position du verbe qui distingue les types.",
        ]),
      );
    }

    draw();
    return el("div", { class: "w-root" }, [picker, row, out]);
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
    intervalle: intervalle,
    echiquier: echiquier,
    "trapeze-vocalique": trapezeVocalique,
    punnett: punnett,
    "matrice-2d": matrice2d,
    logistique: logistique,
    "theorie-jeux": theorieJeux,
    "harmonie-vocalique": harmonieVocalique,
    ton: ton,
    "racine-arabe": racineArabe,
    abugida: abugida,
    "ordre-des-mots": ordreDesMots,
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
