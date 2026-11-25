import { describe, expect, it } from "vitest";
import {
  hs256,
  NatTable,
  adLayout,
  adPath,
  chainOutcome,
  corsCheck,
  evaluate,
  humanDuration,
  inCidr,
  keyspace,
  matchRule,
  numbered,
  parseAd,
  parseDefenses,
  parseEchange,
  parseMode,
  parsePacket,
  parseRule,
  parseStages,
  signJwt,
  tunnelPlan,
  verifyJwt,
  type CorsServer,
  type Rule,
} from "./cyber";

describe("numbered keys", () => {
  it("reads m1, m2… in numeric order and skips empty ones", () => {
    expect(
      numbered({ m10: "c", m2: "b", m1: "a", m3: "", x: "no" }, "m"),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("échange", () => {
  it("parses actors, replies, attacks and notes", () => {
    const { actors, messages } = parseEchange({
      acteurs: "Victime | Attaquant",
      m1: "Victime -> Attaquant : NEGOTIATE | La victime croit parler au partage.",
      m2: "!Attaquant -> Cible : NEGOTIATE (relayé)",
      m3: "Cible --> Attaquant : CHALLENGE",
    });
    expect(actors).toEqual(["Victime", "Attaquant", "Cible"]);
    expect(messages[0]).toMatchObject({
      from: 0,
      to: 1,
      label: "NEGOTIATE",
      reply: false,
      attack: false,
      note: "La victime croit parler au partage.",
    });
    expect(messages[1]).toMatchObject({ from: 1, to: 2, attack: true });
    expect(messages[2]).toMatchObject({ from: 2, to: 1, reply: true });
  });
  it("keeps a colon inside the label", () => {
    expect(
      parseEchange({ acteurs: "A | B", m1: "A -> B : Host: api.example" })
        .messages[0].label,
    ).toBe("Host: api.example");
  });
});

describe("pare-feu", () => {
  const rules = [
    "-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "-A INPUT -i lo -j ACCEPT",
    "-A INPUT -p tcp --dport 22 -s 10.8.0.0/24 -j ACCEPT",
    "-A INPUT -p tcp --dport 22 -j DROP",
    "-A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT",
  ].map((r) => parseRule(r)!) as Rule[];

  it("parses the options a lesson uses", () => {
    expect(rules[2]).toMatchObject({
      proto: "tcp",
      ports: [22],
      src: "10.8.0.0/24",
      target: "ACCEPT",
    });
    expect(rules[4].ports).toEqual([80, 443]);
    expect(rules[0].states).toEqual(["ESTABLISHED", "RELATED"]);
    expect(parseRule("-A INPUT -p tcp")).toBeNull();
  });
  it("CIDR membership", () => {
    expect(inCidr("10.8.0.6", "10.8.0.0/24")).toBe(true);
    expect(inCidr("10.8.1.6", "10.8.0.0/24")).toBe(false);
    expect(inCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
    expect(inCidr("999.1.1.1", "0.0.0.0/0")).toBe(false);
  });
  it("first match decides, in order", () => {
    expect(evaluate(rules, parsePacket("tcp 10.8.0.6 22 NEW"))).toMatchObject({
      hit: 2,
      target: "ACCEPT",
    });
    expect(
      evaluate(rules, parsePacket("tcp 185.220.101.4 22 NEW")),
    ).toMatchObject({ hit: 3, target: "DROP" });
    expect(
      evaluate(rules, parsePacket("tcp 185.220.101.4 443 NEW")),
    ).toMatchObject({ hit: 4, target: "ACCEPT" });
    expect(
      evaluate(rules, parsePacket("udp 1.1.1.1 41022 ESTABLISHED")),
    ).toMatchObject({ hit: 0 });
    expect(evaluate(rules, parsePacket("udp 8.8.8.8 53 NEW"))).toMatchObject({
      hit: -1,
      target: "DROP",
    });
  });
  it("turning a rule off lets the packet fall to the next one", () => {
    const v = evaluate(
      rules,
      parsePacket("tcp 10.8.0.6 22 NEW"),
      "DROP",
      new Set([2]),
    );
    expect(v).toMatchObject({ hit: 3, target: "DROP" });
    expect(v.checks[2]).toMatchObject({ off: true });
  });
  it("explains a miss", () => {
    expect(matchRule(rules[2], parsePacket("tcp 10.8.0.6 443 NEW")).why).toBe(
      "port 443 ≠ 22",
    );
    expect(
      matchRule(rules[2], parsePacket("tcp 8.8.8.8 22 NEW")).why,
    ).toContain("hors de 10.8.0.0/24");
  });
  it("negated source", () => {
    const r = parseRule("-A INPUT ! -s 10.0.0.0/8 -j DROP")!;
    expect(r).toMatchObject({ srcNot: true, src: "10.0.0.0/8" });
    expect(matchRule(r, parsePacket("tcp 8.8.8.8 22 NEW")).ok).toBe(true);
    expect(matchRule(r, parsePacket("tcp 10.1.1.1 22 NEW")).ok).toBe(false);
  });
});

describe("CORS", () => {
  const site = "https://app.exemple.fr";
  const evil = "https://evil.example";
  const srv = (o: Partial<CorsServer>): CorsServer => ({
    allowOrigin: "list",
    list: [site],
    allowCredentials: true,
    allowMethods: ["GET", "POST"],
    ...o,
  });

  it("a simple GET from the site is readable", () => {
    expect(
      corsCheck(
        { origin: site, method: "GET", json: false, credentials: true },
        srv({}),
      ),
    ).toMatchObject({ preflight: false, readable: true, flaw: false });
  });
  it("a foreign origin is not readable but the simple request still ran", () => {
    expect(
      corsCheck(
        { origin: evil, method: "GET", json: false, credentials: true },
        srv({}),
      ),
    ).toMatchObject({ sent: true, readable: false });
  });
  it("* with cookies is refused", () => {
    const r = corsCheck(
      { origin: evil, method: "GET", json: false, credentials: true },
      srv({ allowOrigin: "star" }),
    );
    expect(r.readable).toBe(false);
    expect(r.reasons[0]).toContain("*");
  });
  it("reflecting the Origin with credentials is the flaw", () => {
    expect(
      corsCheck(
        { origin: evil, method: "GET", json: false, credentials: true },
        srv({ allowOrigin: "reflect" }),
      ),
    ).toMatchObject({ readable: true, flaw: true });
  });
  it("JSON or PUT needs a preflight, and a failed preflight sends nothing", () => {
    const r = corsCheck(
      { origin: site, method: "PUT", json: true, credentials: false },
      srv({}),
    );
    expect(r).toMatchObject({
      preflight: true,
      preflightOk: false,
      sent: false,
    });
    expect(
      corsCheck(
        { origin: site, method: "PUT", json: true, credentials: false },
        srv({ allowMethods: ["GET", "POST", "PUT"] }),
      ).readable,
    ).toBe(true);
  });
  it("credentials without Allow-Credentials", () => {
    expect(
      corsCheck(
        { origin: site, method: "GET", json: false, credentials: true },
        srv({ allowCredentials: false }),
      ).readable,
    ).toBe(false);
  });
});

describe("NAT", () => {
  it("allocates public ports and finds replies", () => {
    const t = new NatTable("203.0.113.5", 40001);
    const a = t.out("192.168.1.10", 51544, "93.184.216.34:443");
    const b = t.out("192.168.1.11", 51544, "93.184.216.34:443");
    expect([a.pub, b.pub]).toEqual([40001, 40002]);
    expect(t.out("192.168.1.10", 51544, "93.184.216.34:443")).toBe(a);
    expect(t.in(40002)?.ip).toBe("192.168.1.11");
    expect(t.in(22)).toBeNull();
  });
});

describe("tunnels", () => {
  const o = {
    kali: "10.10.14.5",
    pivot: "10.10.10.20",
    target: "172.16.0.50:3306",
    lport: 3306,
  };
  it("mode parsing", () => {
    expect(parseMode("-R")).toBe("R");
    expect(parseMode("socks")).toBe("D");
    expect(parseMode("")).toBe("L");
  });
  it("-L runs on your machine, -R on the pivot", () => {
    expect(tunnelPlan("L", o)).toMatchObject({
      runOn: "kali",
      sshFrom: 0,
      command: "ssh -N -L 3306:172.16.0.50:3306 user@10.10.10.20",
    });
    expect(tunnelPlan("R", o)).toMatchObject({
      runOn: "pivot",
      sshFrom: 1,
      command: "ssh -N -R 3306:172.16.0.50:3306 kali@10.10.14.5",
    });
    expect(tunnelPlan("D", o).use).toContain("172.16.0.0/24");
  });
});

describe("JWT", () => {
  const H = { alg: "HS256", typ: "JWT" };
  it("signs and verifies with the server secret (RFC 7515 HMAC)", async () => {
    const t = await signJwt(H, { sub: "j.martin", role: "user" }, "azerty123");
    expect(await verifyJwt(t, "azerty123", false)).toMatchObject({
      ok: true,
      via: "signature",
    });
    expect(await verifyJwt(t, "autre", false)).toMatchObject({ ok: false });
  });
  it("editing the payload breaks the signature", async () => {
    const t = await signJwt(H, { role: "user" }, "azerty123");
    const [h, , s] = t.split(".");
    const forged = `${h}.${(await signJwt(H, { role: "admin" }, "x")).split(".")[1]}.${s}`;
    expect((await verifyJwt(forged, "azerty123", false)).ok).toBe(false);
  });
  it("alg none passes only on a vulnerable server", async () => {
    const t = await signJwt(
      { alg: "none", typ: "JWT" },
      { role: "admin" },
      null,
    );
    expect(t.endsWith(".")).toBe(true);
    expect((await verifyJwt(t, "azerty123", false)).ok).toBe(false);
    expect(await verifyJwt(t, "azerty123", true)).toMatchObject({
      ok: true,
      via: "none",
    });
  });
  it("known HS256 vector", async () => {
    // jwt.io's default example token
    const t = await signJwt(
      H,
      { sub: "1234567890", name: "John Doe", iat: 1516239022 },
      "your-256-bit-secret",
    );
    expect(t.split(".")[2]).toBe("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
  });
});

describe("chemin AD", () => {
  const props = {
    depart: "j.martin",
    arrivee: "corp.local",
    e1: "j.martin -MemberOf-> Helpdesk | membre",
    e2: "Helpdesk -AdminTo-> WS042",
    e3: "WS042 -HasSession-> adm.lefevre",
    e4: "adm.lefevre -MemberOf-> IT-Admins",
    e5: "IT-Admins -GenericAll-> svc_backup",
    e6: "j.martin -GenericWrite-> SRV-FILE01",
    e7: "SRV-FILE01 -HasSession-> svc_backup",
    e8: "svc_backup -DCSync-> corp.local",
  };
  const ad = parseAd(props);
  it("parses edges and guesses node kinds", () => {
    expect(ad.edges).toHaveLength(8);
    expect(ad.kinds).toMatchObject({
      Helpdesk: "G",
      WS042: "C",
      "corp.local": "D",
      "j.martin": "U",
    });
  });
  it("finds the shortest path, then the next one when an edge is fixed", () => {
    expect(adPath(ad.edges, ad.start, ad.goal)).toEqual([5, 6, 7]);
    expect(adPath(ad.edges, ad.start, ad.goal, new Set([5]))).toEqual([
      0, 1, 2, 3, 4, 7,
    ]);
    expect(adPath(ad.edges, ad.start, ad.goal, new Set([5, 7]))).toBeNull();
  });
  it("lays out by distance, the goal alone in the last column", () => {
    const pos = adLayout(ad.edges, ad.start, ad.goal);
    expect(pos["j.martin"][0]).toBe(0);
    expect(pos["corp.local"][0]).toBe(1);
    expect(Object.values(pos).filter(([x]) => x === 1)).toHaveLength(1);
  });
});

describe("kill chain", () => {
  const stages = parseStages({
    e1: "J0 | Accès initial",
    e2: "J0 | Exécution",
    e3: "J1 | Persistance",
    e4: "J5 | Mouvement latéral",
    e5: "J12 | Chiffrement",
  });
  const defs = () =>
    parseDefenses({
      d1: "MFA | bloque 1",
      d2: "EDR | détecte 2 | actif",
      d3: "SOC 24 h | soc",
      d4: "LAPS | bloque 4",
      d5: "Sauvegardes | sauvegarde",
    });
  it("parses stages and defenses", () => {
    expect(stages[4]).toMatchObject({ day: 12, name: "Chiffrement" });
    expect(defs()[1]).toMatchObject({ detects: [1], on: true });
  });
  it("an unhandled alert does not stop anything", () => {
    expect(chainOutcome(stages, defs())).toMatchObject({
      halt: -1,
      firstAlert: 1,
    });
  });
  it("a SOC that acts within a day stops the next day's stage", () => {
    const d = defs();
    d[2].on = true;
    expect(chainOutcome(stages, d)).toMatchObject({ halt: 2, by: "soc" });
  });
  it("the earliest block wins", () => {
    const d = defs();
    d[0].on = true;
    d[3].on = true;
    expect(chainOutcome(stages, d)).toMatchObject({ halt: 0, by: "block" });
  });
});

describe("cassage", () => {
  it("keyspace", () => {
    expect(keyspace(4, ["chiffres"])).toBe(10_000);
    expect(keyspace(2, ["minuscules", "majuscules"])).toBe(52 ** 2);
    expect(keyspace(8, [])).toBe(0);
  });
  it("human durations", () => {
    expect(humanDuration(0.2)).toBe("instantané");
    expect(humanDuration(90)).toBe("1,5 minutes");
    expect(humanDuration(86400 * 3)).toBe("3 jours");
    expect(humanDuration(1e30)).toBe("plus que l'âge de l'Univers");
  });
});

describe("hs256", () => {
  it("accepts an empty secret (same MAC as the RFC's empty key)", async () => {
    expect(await hs256("", "abc")).toBe(
      "_XrbFSwF74Dcz1Ch-kwF1aPsbalVdfwxKufF0JGDY1E",
    );
  });
});
