// Pure models behind the "cyber" widget pack (public/js/cyber/*.js): the
// protocol exchange, the firewall chain, the CORS check, the NAT table, the
// SSH tunnels, the JWT workshop, the Active Directory attack path, the attack
// chain and the cracking times. The widgets only draw what these return, so
// every rule a reader learns from them is tested here (lib/cyber.test.ts).
//
// Props arrive as strings, one per key (widgetProps in lib/node/markdown.ts): a
// key repeated in a block overwrites the previous one, so lists are written
// as numbered keys (m1, m2…, r1, r2…), read back in order by `numbered()`.

/** Values of `prefix1`, `prefix2`… in numeric order (gaps allowed). */
export function numbered(
  props: Record<string, unknown>,
  prefix: string,
): string[] {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  return Object.keys(props)
    .map((k) => [k, re.exec(k)] as const)
    .filter((x): x is readonly [string, RegExpExecArray] => !!x[1])
    .sort((a, b) => Number(a[1][1]) - Number(b[1][1]))
    .map(([k]) => String(props[k] ?? "").trim())
    .filter(Boolean);
}

const splitBar = (s: string) => s.split("|").map((x) => x.trim());

// ------------------------------------------------------------- échange

export interface Message {
  from: number;
  to: number;
  label: string;
  note: string;
  /** `-->`: a reply, drawn dashed. */
  reply: boolean;
  /** Leading `!`: an attacker's message, drawn in the danger colour. */
  attack: boolean;
}

/**
 * `acteurs: Client | Résolveur | Racine` and lines
 * `m1: Client -> Résolveur : www.example.com ? | Why this message leaves.`
 * An actor named in a line but missing from `acteurs` is appended.
 */
export function parseEchange(props: Record<string, unknown>): {
  actors: string[];
  messages: Message[];
} {
  const actors = splitBar(String(props.acteurs ?? "")).filter(Boolean);
  const idx = (name: string) => {
    let i = actors.indexOf(name);
    if (i < 0) {
      actors.push(name);
      i = actors.length - 1;
    }
    return i;
  };
  const messages: Message[] = [];
  for (const line of numbered(props, "m")) {
    const [head, ...rest] = splitBar(line);
    const m = /^(!)?\s*(.+?)\s*(-->|->)\s*(.+?)\s*:\s*(.*)$/.exec(head);
    if (!m) continue;
    messages.push({
      attack: !!m[1],
      from: idx(m[2]),
      reply: m[3] === "-->",
      to: idx(m[4]),
      label: m[5],
      note: rest.join(" | "),
    });
  }
  return { actors, messages };
}

// ------------------------------------------------------------ pare-feu

export interface Packet {
  proto: "tcp" | "udp" | "icmp";
  src: string;
  port: number;
  state: "NEW" | "ESTABLISHED";
  iface?: string;
}

export interface Rule {
  text: string;
  target: string;
  proto?: string;
  ports?: number[];
  src?: string;
  srcNot?: boolean;
  states?: string[];
  iface?: string;
}

/** The subset of iptables a lesson needs: -p, --dport/--dports, -s (and ! -s), -i, --state/--ctstate, -j. */
export function parseRule(text: string): Rule | null {
  const t = text.replace(/^-A\s+\S+\s*/, "").trim();
  const tok = t.split(/\s+/);
  const r: Rule = { text: text.trim(), target: "" };
  for (let i = 0; i < tok.length; i++) {
    const a = tok[i];
    const v = tok[i + 1];
    if (a === "-p" || a === "--protocol") {
      r.proto = v?.toLowerCase();
      i++;
    } else if (a === "--dport" || a === "--destination-port") {
      r.ports = [Number(v)];
      i++;
    } else if (a === "--dports") {
      r.ports = String(v).split(",").map(Number);
      i++;
    } else if (a === "!" && (v === "-s" || v === "--source")) {
      r.srcNot = true;
      r.src = tok[i + 2];
      i += 2;
    } else if (a === "-s" || a === "--source") {
      r.src = v;
      i++;
    } else if (a === "-i" || a === "--in-interface") {
      r.iface = v;
      i++;
    } else if (a === "--state" || a === "--ctstate") {
      r.states = String(v).toUpperCase().split(",");
      i++;
    } else if (a === "-j" || a === "--jump") {
      r.target = String(v).toUpperCase();
      i++;
    }
  }
  return r.target ? r : null;
}

export function ipToInt(ip: string): number | null {
  const p = ip.trim().split(".");
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255))
    return null;
  return p.reduce((a, x) => a * 256 + Number(x), 0);
}

export function inCidr(ip: string, cidr: string): boolean {
  const [net, bitsS] = cidr.split("/");
  const bits = bitsS === undefined ? 32 : Number(bitsS);
  const a = ipToInt(ip);
  const b = ipToInt(net);
  if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(a / size) === Math.floor(b / size);
}

/** Does `rule` take `p`? With the first condition that fails, in plain French. */
export function matchRule(rule: Rule, p: Packet): { ok: boolean; why: string } {
  if (rule.states) {
    if (!rule.states.includes(p.state))
      return {
        ok: false,
        why:
          p.state === "NEW"
            ? "nouvelle connexion, pas une réponse"
            : `état ${p.state} non visé`,
      };
  }
  if (rule.iface) {
    const iface = p.iface ?? (p.src.startsWith("127.") ? "lo" : "eth0");
    if (iface !== rule.iface)
      return { ok: false, why: `arrive par ${iface}, pas ${rule.iface}` };
  }
  if (rule.proto && rule.proto !== "all" && rule.proto !== p.proto)
    return { ok: false, why: `${p.proto} ≠ ${rule.proto}` };
  if (rule.src) {
    const inside = inCidr(p.src, rule.src);
    if (inside === !!rule.srcNot)
      return {
        ok: false,
        why: rule.srcNot
          ? `${p.src} est dans ${rule.src}`
          : `${p.src} hors de ${rule.src}`,
      };
  }
  if (rule.ports && !rule.ports.includes(p.port))
    return {
      ok: false,
      why:
        rule.ports.length > 1
          ? `port ${p.port} absent de ${rule.ports.join(",")}`
          : `port ${p.port} ≠ ${rule.ports[0]}`,
    };
  const what = [
    rule.states
      ? p.state === "NEW"
        ? "nouvelle connexion"
        : p.state === "ESTABLISHED"
          ? "réponse à une connexion acceptée"
          : p.state === "RELATED"
            ? "connexion liée à une autre"
            : `état ${p.state}`
      : "",
    rule.iface ? `interface ${rule.iface}` : "",
    rule.proto ? rule.proto : "",
    rule.ports ? `port ${p.port}` : "",
    rule.src
      ? rule.srcNot
        ? `hors de ${rule.src}`
        : `depuis ${rule.src}`
      : "",
  ].filter(Boolean);
  return { ok: true, why: what.join(", ") || "tout paquet" };
}

export interface Verdict {
  /** Index of the deciding rule, -1 for the default policy. */
  hit: number;
  target: string;
  checks: { ok: boolean; why: string; off: boolean }[];
}

/** First matching rule decides; LOG and RETURN-less targets other than ACCEPT/DROP/REJECT keep going. */
export function evaluate(
  rules: Rule[],
  p: Packet,
  policy = "DROP",
  off: Set<number> = new Set(),
): Verdict {
  const checks: Verdict["checks"] = [];
  for (let i = 0; i < rules.length; i++) {
    if (off.has(i)) {
      checks.push({ ok: false, why: "règle désactivée", off: true });
      continue;
    }
    const m = matchRule(rules[i], p);
    checks.push({ ...m, off: false });
    if (m.ok && ["ACCEPT", "DROP", "REJECT"].includes(rules[i].target))
      return { hit: i, target: rules[i].target, checks };
  }
  return { hit: -1, target: policy.toUpperCase(), checks };
}

/** `tcp 10.8.0.6 22 NEW` → Packet. */
export function parsePacket(s: unknown): Packet {
  const [proto, src, port, state] = String(s ?? "")
    .trim()
    .split(/\s+/);
  return {
    proto: proto === "udp" || proto === "icmp" ? proto : "tcp",
    src: src && ipToInt(src) !== null ? src : "10.8.0.6",
    port: Number(port) || 0,
    state: String(state).toUpperCase().startsWith("EST")
      ? "ESTABLISHED"
      : "NEW",
  };
}

// ---------------------------------------------------------------- CORS

export interface CorsReq {
  origin: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  json: boolean;
  credentials: boolean;
}
export interface CorsServer {
  /** none | star | list | reflect | null */
  allowOrigin: string;
  /** The site's own origins: what the `list` mode accepts, and what is not an attacker. */
  list: string[];
  allowCredentials: boolean;
  allowMethods: string[];
}
export interface CorsResult {
  preflight: boolean;
  preflightOk: boolean;
  /** The request reached the server (and ran there). */
  sent: boolean;
  readable: boolean;
  acao: string | null;
  reasons: string[];
  /** A foreign origin reads an authenticated response. */
  flaw: boolean;
}

export function acaoFor(server: CorsServer, origin: string): string | null {
  switch (server.allowOrigin) {
    case "star":
      return "*";
    case "reflect":
      return origin;
    case "null":
      return "null";
    case "list":
      return server.list.includes(origin) ? origin : null;
    default:
      return null;
  }
}

export function corsCheck(req: CorsReq, server: CorsServer): CorsResult {
  const acao = acaoFor(server, req.origin);
  const preflight = !["GET", "POST"].includes(req.method) || req.json;
  const reasons: string[] = [];
  let originOk = false;
  if (acao === null)
    reasons.push(
      "la réponse ne porte pas Access-Control-Allow-Origin pour cette origine",
    );
  else if (acao === "*" && req.credentials)
    reasons.push("« * » est refusé quand la requête envoie des cookies");
  else if (acao !== "*" && acao !== req.origin)
    reasons.push(`Allow-Origin vaut ${acao}, pas ${req.origin}`);
  else originOk = true;
  const credOk = !req.credentials || server.allowCredentials;
  if (originOk && !credOk)
    reasons.push("les cookies partent mais Allow-Credentials: true manque");
  const methodOk =
    !preflight ||
    ["GET", "POST"].includes(req.method) ||
    server.allowMethods.includes(req.method);
  if (!methodOk) reasons.push(`${req.method} n'est pas dans Allow-Methods`);
  const preflightOk = !preflight || (originOk && credOk && methodOk);
  const readable = preflightOk && originOk && credOk;
  const sent = !preflight || preflightOk;
  return {
    preflight,
    preflightOk,
    sent,
    readable,
    acao,
    reasons,
    flaw: readable && req.credentials && !server.list.includes(req.origin),
  };
}

// ----------------------------------------------------------------- NAT

export interface NatRow {
  ip: string;
  port: number;
  pub: number;
  dst: string;
}

/** PAT: each outbound flow gets the next free public port; an inbound packet finds its row or is dropped. */
export class NatTable {
  rows: NatRow[] = [];
  private next: number;
  constructor(
    public wan: string,
    first = 40001,
    private max = 6,
  ) {
    this.next = first;
  }
  out(ip: string, port: number, dst: string): NatRow {
    const same = this.rows.find(
      (r) => r.ip === ip && r.port === port && r.dst === dst,
    );
    if (same) return same;
    const row = { ip, port, pub: this.next++, dst };
    this.rows.push(row);
    if (this.rows.length > this.max) this.rows.shift();
    return row;
  }
  in(pubPort: number): NatRow | null {
    return this.rows.find((r) => r.pub === pubPort) ?? null;
  }
}

// ------------------------------------------------------------- tunnels

export type TunnelMode = "L" | "R" | "D";

export function parseMode(v: unknown): TunnelMode {
  const s = String(v ?? "")
    .trim()
    .replace(/^-/, "")
    .toUpperCase();
  return s === "R" || s.startsWith("DIST") || s.startsWith("REM")
    ? "R"
    : s === "D" || s.startsWith("SOCKS") || s.startsWith("DYN")
      ? "D"
      : "L";
}

export interface TunnelPlan {
  /** Machine the command is typed on. */
  runOn: "kali" | "pivot";
  command: string;
  /** Who opens the SSH session: 0 = you, 1 = the pivot. */
  sshFrom: 0 | 1;
  /** Where the forwarded port listens (always your machine in these three cases). */
  listen: string;
  use: string;
}

export function tunnelPlan(
  mode: TunnelMode,
  o: {
    kali: string;
    pivot: string;
    target: string;
    lport: number;
    dport?: number;
  },
): TunnelPlan {
  const [th, tp] = o.target.split(":");
  if (mode === "R")
    return {
      runOn: "pivot",
      command: `ssh -N -R ${o.lport}:${th}:${tp} kali@${o.kali}`,
      sshFrom: 1,
      listen: `127.0.0.1:${o.lport} (chez toi)`,
      use: `nc 127.0.0.1 ${o.lport}`,
    };
  if (mode === "D")
    return {
      runOn: "kali",
      command: `ssh -N -D ${o.lport} user@${o.pivot}`,
      sshFrom: 0,
      listen: `SOCKS 127.0.0.1:${o.lport}`,
      use: `proxychains nmap -sT -Pn ${th.replace(/\.\d+$/, ".0/24")}`,
    };
  return {
    runOn: "kali",
    command: `ssh -N -L ${o.lport}:${th}:${tp} user@${o.pivot}`,
    sshFrom: 0,
    listen: `127.0.0.1:${o.lport} (chez toi)`,
    use: `nc 127.0.0.1 ${o.lport}`,
  };
}

// ----------------------------------------------------------------- JWT

export function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function b64urlBytes(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function b64urlDecode(s: string): string {
  const pad =
    s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export async function hs256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  // Web Crypto refuses an empty HMAC key; HMAC pads keys with zeros to the
  // block size, so one zero byte gives the same MAC as the empty key.
  const raw = secret ? enc.encode(secret) : new Uint8Array(1);
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64urlBytes(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signJwt(
  header: object,
  payload: object,
  secret: string | null,
): Promise<string> {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const alg = (header as { alg?: string }).alg;
  const sig =
    alg === "none" || secret === null ? "" : await hs256(secret, `${h}.${p}`);
  return `${h}.${p}.${sig}`;
}

export type JwtCheck =
  | { ok: true; payload: Record<string, unknown>; via: "signature" | "none" }
  | { ok: false; why: string };

/** What a server holding `secret` decides. `acceptNone` is the classic bug. */
export async function verifyJwt(
  token: string,
  secret: string,
  acceptNone: boolean,
): Promise<JwtCheck> {
  const parts = token.split(".");
  if (parts.length !== 3)
    return { ok: false, why: "un JWT a trois parties séparées par des points" };
  let header: { alg?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
    payload = JSON.parse(b64urlDecode(parts[1]));
  } catch {
    return { ok: false, why: "en-tête ou charge utile illisible" };
  }
  if (String(header.alg).toLowerCase() === "none") {
    return acceptNone
      ? { ok: true, payload, via: "none" }
      : { ok: false, why: "le serveur refuse alg: none" };
  }
  if (header.alg !== "HS256")
    return { ok: false, why: `algorithme ${header.alg} non accepté` };
  const expect = await hs256(secret, `${parts[0]}.${parts[1]}`);
  return expect === parts[2]
    ? { ok: true, payload, via: "signature" }
    : { ok: false, why: "signature invalide pour le secret du serveur" };
}

// ------------------------------------------------------- chemin AD

export type NodeKind = "U" | "G" | "C" | "D";
export interface AdEdge {
  from: string;
  to: string;
  type: string;
  note: string;
}

/** `e1: j.martin -MemberOf-> Helpdesk | j.martin est membre de Helpdesk.` */
export function parseAd(props: Record<string, unknown>): {
  edges: AdEdge[];
  kinds: Record<string, NodeKind>;
  start: string;
  goal: string;
} {
  const edges: AdEdge[] = [];
  for (const line of numbered(props, "e")) {
    const [head, ...rest] = splitBar(line);
    const m = /^(.+?)\s+-([A-Za-z][\w-]*)->\s+(.+)$/.exec(head);
    if (m)
      edges.push({
        from: m[1].trim(),
        type: m[2],
        to: m[3].trim(),
        note: rest.join(" | "),
      });
  }
  const kinds: Record<string, NodeKind> = {};
  for (const pair of String(props.noeuds ?? "").split(",")) {
    const [n, k] = pair.split("=").map((x) => x.trim());
    if (n && /^[UGCD]$/i.test(k ?? "")) kinds[n] = k.toUpperCase() as NodeKind;
  }
  const names = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
  for (const n of names) if (!kinds[n]) kinds[n] = guessKind(n, edges);
  const start = String(props.depart ?? edges[0]?.from ?? "").trim();
  // `arrivee`, not `cible`: `cible` is the goal-condition key of every widget.
  const goal = String(
    props.arrivee ?? edges[edges.length - 1]?.to ?? "",
  ).trim();
  return { edges, kinds, start, goal };
}

function guessKind(n: string, edges: AdEdge[]): NodeKind {
  if (/\.(local|lan|corp|com|fr|net)$/i.test(n)) return "D";
  if (edges.some((e) => e.to === n && e.type === "MemberOf")) return "G";
  if (
    edges.some(
      (e) =>
        (e.from === n && e.type === "HasSession") ||
        (e.to === n && e.type === "AdminTo"),
    )
  )
    return "C";
  return "U";
}

/** Shortest path (fewest edges) as edge indices, or null. */
export function adPath(
  edges: AdEdge[],
  start: string,
  goal: string,
  off: Set<number> = new Set(),
): number[] | null {
  const prev = new Map<string, number | null>([[start, null]]);
  const q = [start];
  while (q.length) {
    const n = q.shift()!;
    if (n === goal) break;
    edges.forEach((e, i) => {
      if (!off.has(i) && e.from === n && !prev.has(e.to)) {
        prev.set(e.to, i);
        q.push(e.to);
      }
    });
  }
  if (!prev.has(goal) || start === goal) return start === goal ? [] : null;
  const path: number[] = [];
  let n = goal;
  while (prev.get(n) != null) {
    const i = prev.get(n)!;
    path.unshift(i);
    n = edges[i].from;
  }
  return path;
}

/** Columns by distance from the start (all edges on), rows in order of appearance. Coordinates in 0..1. */
export function adLayout(
  edges: AdEdge[],
  start: string,
  goal: string,
): Record<string, [number, number]> {
  const depth = new Map<string, number>([[start, 0]]);
  const q = [start];
  while (q.length) {
    const n = q.shift()!;
    for (const e of edges)
      if (e.from === n && !depth.has(e.to)) {
        depth.set(e.to, depth.get(n)! + 1);
        q.push(e.to);
      }
  }
  const names = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
  let maxD = Math.max(0, ...depth.values());
  for (const n of names) if (!depth.has(n)) depth.set(n, maxD);
  // The goal sits alone in the last column.
  if (depth.has(goal)) {
    const deepest = Math.max(
      0,
      ...names.filter((n) => n !== goal).map((n) => depth.get(n)!),
    );
    if (deepest >= depth.get(goal)!) depth.set(goal, deepest + 1);
  }
  maxD = Math.max(1, ...depth.values());
  const cols = new Map<number, string[]>();
  for (const n of names) {
    const d = depth.get(n)!;
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(n);
  }
  const out: Record<string, [number, number]> = {};
  for (const [d, list] of cols)
    list.forEach((n, i) => {
      out[n] = [d / maxD, (i + 1) / (list.length + 1)];
    });
  return out;
}

// -------------------------------------------------------- kill chain

export interface Stage {
  day: number;
  name: string;
  detail: string;
}
export interface Defense {
  label: string;
  blocks: number[];
  detects: number[];
  /** Alerts are acted on within a day. */
  soc: boolean;
  /** Offline backups: the encryption no longer forces a payment. */
  backup: boolean;
  on: boolean;
}

/** `e1: J0 | Accès initial | VPN sans MFA` */
export function parseStages(props: Record<string, unknown>): Stage[] {
  return numbered(props, "e").map((l) => {
    const [d, name, detail = ""] = splitBar(l);
    return {
      day: Number(String(d).replace(/^J/i, "")) || 0,
      name: name || d,
      detail,
    };
  });
}

/** `d1: MFA sur le VPN | bloque 1` · `detecte 2,5` · `soc` · `sauvegarde` · trailing `| actif` turns it on. */
export function parseDefenses(props: Record<string, unknown>): Defense[] {
  return numbered(props, "d").map((l) => {
    const [label, ...rest] = splitBar(l);
    const d: Defense = {
      label,
      blocks: [],
      detects: [],
      soc: false,
      backup: false,
      on: false,
    };
    for (const r of rest) {
      const s = r.toLowerCase();
      const nums = (s.match(/\d+/g) || []).map((n) => Number(n) - 1);
      if (s.startsWith("bloq")) d.blocks.push(...nums);
      else if (s.startsWith("détect") || s.startsWith("detect"))
        d.detects.push(...nums);
      else if (s.startsWith("soc")) d.soc = true;
      else if (s.startsWith("sauv")) d.backup = true;
      else if (s.startsWith("actif")) d.on = true;
    }
    return d;
  });
}

export interface ChainOutcome {
  /** Stage index where the attack stops, -1 if it runs to the end. */
  halt: number;
  by: "block" | "soc" | null;
  detected: number[];
  firstAlert: number;
  backup: boolean;
}

export function chainOutcome(stages: Stage[], defs: Defense[]): ChainOutcome {
  const on = defs.filter((d) => d.on);
  const blocks = on
    .flatMap((d) => d.blocks)
    .filter((i) => i >= 0 && i < stages.length);
  const block = blocks.length ? Math.min(...blocks) : -1;
  const detected = [...new Set(on.flatMap((d) => d.detects))]
    .filter((i) => i >= 0 && i < stages.length && (block < 0 || i <= block))
    .sort((a, b) => a - b);
  const firstAlert = detected.length ? detected[0] : -1;
  let socStop = -1;
  if (on.some((d) => d.soc) && firstAlert >= 0) {
    const day = stages[firstAlert].day + 1;
    socStop = stages.findIndex((s, i) => i > firstAlert && s.day >= day);
  }
  const cands = [block, socStop].filter((x) => x >= 0);
  const halt = cands.length ? Math.min(...cands) : -1;
  return {
    halt,
    by: halt < 0 ? null : halt === block ? "block" : "soc",
    detected,
    firstAlert,
    backup: on.some((d) => d.backup),
  };
}

// ------------------------------------------------------------ cassage

/** Order of magnitude, hashcat on one RTX 4090 (published benchmarks, 2023–2025). */
export const HASH_RATES: {
  id: string;
  name: string;
  rate: number;
  note: string;
}[] = [
  { id: "ntlm", name: "NTLM", rate: 2.9e11, note: "Windows, sans sel" },
  { id: "md5", name: "MD5", rate: 1.6e11, note: "vieux sites" },
  {
    id: "sha256",
    name: "SHA-256",
    rate: 2.2e10,
    note: "rapide, pas fait pour ça",
  },
  {
    id: "bcrypt",
    name: "bcrypt (coût 10)",
    rate: 5.7e3,
    note: "lent exprès, salé",
  },
];

export const CHARSETS = {
  minuscules: 26,
  majuscules: 26,
  chiffres: 10,
  symboles: 33,
} as const;
export type Charset = keyof typeof CHARSETS;

/** Size of the search: every string of `len` over the chosen sets, or a wordlist × suffixes. */
export function keyspace(len: number, sets: Charset[], dict = false): number {
  if (dict) return 14.3e6 * 100;
  const n = sets.reduce((a, s) => a + CHARSETS[s], 0);
  return n ? n ** len : 0;
}

/** Seconds as a French phrase: "instantané", "3,2 heures", "plus que l'âge de l'Univers". */
export function humanDuration(s: number): string {
  if (!(s >= 1)) return "instantané";
  const year = 31557600;
  if (s >= 13.8e9 * year) return "plus que l'âge de l'Univers";
  const units: [number, string][] = [
    [1e9 * year, "milliards d'années"],
    [1e6 * year, "millions d'années"],
    [1e3 * year, "millénaires"],
    [year, "ans"],
    [86400, "jours"],
    [3600, "heures"],
    [60, "minutes"],
    [1, "secondes"],
  ];
  for (const [d, name] of units) {
    if (s >= d) {
      const v = s / d;
      const txt =
        v < 10
          ? v.toFixed(1).replace(".", ",").replace(/,0$/, "")
          : Math.round(v).toLocaleString("fr-FR");
      return `${txt} ${name}`;
    }
  }
  return "instantané";
}
