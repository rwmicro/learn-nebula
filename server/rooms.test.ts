import { describe, expect, it } from "vitest";
import {
  Bucket,
  MAX_MESSAGE_BYTES,
  RoomRegistry,
  base32,
  cleanIceServers,
  newCode,
  relayable,
  validCode,
  validRef,
} from "./rooms.ts";

const opts = { idleMs: 10_000, maxMs: 60_000, maxRooms: 3 };

describe("codes", () => {
  it("base32 matches RFC 4648 (lower case, no padding)", () => {
    expect(base32(new TextEncoder().encode("foobar"))).toBe("mzxw6ytboi");
    expect(base32(new Uint8Array([]))).toBe("");
  });
  it("room codes carry 120 random bits and validate", () => {
    const a = newCode();
    expect(a).toHaveLength(24);
    expect(validCode(a)).toBe(true);
    expect(newCode()).not.toBe(a);
    expect(validCode("ABC")).toBe(false);
    expect(validCode(a + "a")).toBe(false);
    expect(validCode("a".repeat(23) + "1")).toBe(false);
  });
  it("refs are slugified note paths only", () => {
    expect(validRef("social-sciences/languages-dialects/kabyle")).toBe(true);
    expect(validRef("../etc/passwd")).toBe(false);
    expect(validRef("a//b")).toBe(false);
    expect(validRef("Foo")).toBe(false);
    expect(validRef("a/" + "b".repeat(300))).toBe(false);
  });
});

describe("RoomRegistry", () => {
  it("gives the host slot to the key holder and the guest slot to the link", () => {
    const reg = new RoomRegistry<string>(opts);
    const { code, hostKey } = reg.create("duel", "maths/x", 0)!;
    const g = reg.join(code, undefined, "G", 1);
    expect(g).toMatchObject({ ok: true, role: "guest" });
    const h = reg.join(code, hostKey, "H", 2);
    expect(h).toMatchObject({ ok: true, role: "host" });
    expect(reg.other(code, "host", 3)).toBe("G");
    expect(reg.other(code, "guest", 3)).toBe("H");
  });

  it("holds two peers at most; a wrong key is a guest", () => {
    const reg = new RoomRegistry<string>(opts);
    const { code, hostKey } = reg.create("tandem", null, 0)!;
    reg.join(code, hostKey, "H", 0);
    reg.join(code, "nope", "G", 0);
    expect(reg.join(code, undefined, "X", 0)).toEqual({ ok: false, error: "full" });
    expect(reg.join(code, hostKey, "Y", 0)).toEqual({ ok: false, error: "full" });
  });

  it("frees a slot on leave, only for the peer holding it", () => {
    const reg = new RoomRegistry<string>(opts);
    const { code } = reg.create("duel", null, 0)!;
    reg.join(code, undefined, "G", 0);
    reg.leave(code, "guest", "other", 1);
    expect(reg.join(code, undefined, "G2", 1)).toMatchObject({ ok: false });
    reg.leave(code, "guest", "G", 1);
    expect(reg.join(code, undefined, "G2", 2)).toMatchObject({ ok: true, role: "guest" });
  });

  it("expires after idle time and after the hard maximum", () => {
    const reg = new RoomRegistry<string>(opts);
    const a = reg.create("duel", null, 0)!;
    expect(reg.get(a.code, 10_001)).toBeNull();
    expect(reg.join(a.code, undefined, "G", 10_001)).toEqual({ ok: false, error: "gone" });

    const b = reg.create("duel", null, 0)!;
    reg.join(b.code, b.hostKey, "H", 0);
    // Activity keeps it alive past the idle window…
    for (let t = 5_000; t < 60_000; t += 5_000) reg.other(b.code, "host", t);
    expect(reg.get(b.code, 59_000)).not.toBeNull();
    // …but never past the maximum; the sweep hands back its peers to close.
    expect(reg.sweep(60_001)).toEqual(["H"]);
    expect(reg.size).toBe(0);
  });

  it("refuses new rooms at capacity", () => {
    const reg = new RoomRegistry<string>(opts);
    for (let i = 0; i < 3; i++) expect(reg.create("duel", null, 0)).not.toBeNull();
    expect(reg.create("duel", null, 0)).toBeNull();
    expect(reg.create("duel", null, 20_000)).not.toBeNull(); // the others expired
  });

  it("unknown codes are gone", () => {
    const reg = new RoomRegistry<string>(opts);
    expect(reg.join(newCode(), undefined, "G", 0)).toEqual({ ok: false, error: "gone" });
    expect(reg.other(newCode(), "host", 0)).toBeUndefined();
  });
});

describe("relayable", () => {
  it("forwards known envelopes verbatim", () => {
    const raw = '{"t":"offer","sdp":"v=0\\r\\n"}';
    expect(relayable(raw)).toBe(raw);
    expect(relayable('{"t":"ice","c":null}')).not.toBeNull();
  });
  it("refuses unknown types, non-objects, junk and oversized messages", () => {
    expect(relayable('{"t":"room"}')).toBeNull();
    expect(relayable("[1]")).toBeNull();
    expect(relayable("not json")).toBeNull();
    expect(relayable(new ArrayBuffer(4))).toBeNull();
    expect(relayable(JSON.stringify({ t: "offer", sdp: "x".repeat(MAX_MESSAGE_BYTES) }))).toBeNull();
  });
});

describe("Bucket", () => {
  it("allows a burst, then refills at its rate", () => {
    const b = new Bucket(3, 1, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(500)).toBe(false);
    expect(b.take(1100)).toBe(true);
    expect(b.take(100_000)).toBe(true); // capped at the burst, not unbounded
  });
});

describe("cleanIceServers", () => {
  it("keeps Cloudflare's servers minus port 53", () => {
    const out = cleanIceServers({
      iceServers: [
        { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
        {
          urls: [
            "turn:turn.cloudflare.com:3478?transport=udp",
            "turn:turn.cloudflare.com:53?transport=udp",
            "turns:turn.cloudflare.com:443?transport=tcp",
            "https://evil",
          ],
          username: "u",
          credential: "c",
        },
        { urls: "turn:turn.cloudflare.com:53" },
      ],
    });
    expect(out).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
        username: "u",
        credential: "c",
      },
    ]);
    expect(cleanIceServers(null)).toEqual([]);
  });
});
