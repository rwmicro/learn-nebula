import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  ChallengeStore,
  challengeOf,
  deviceLabel,
  parseTransports,
  relyingParty,
  toCredential,
  toView,
  type CredentialRow,
} from "./passkeys";
import { ACCOUNT_SCHEMA, deleteUser, upsertUser } from "./account-store";
import {
  PASSKEY_SCHEMA,
  credentialById,
  deleteCredential,
  insertCredential,
  listPasskeys,
  touchCredential,
} from "./passkey-store";

describe("relyingParty", () => {
  it("takes the host and origin of an https base", () => {
    expect(relyingParty("https://4d52.net")).toEqual({ id: "4d52.net", origin: "https://4d52.net" });
    expect(relyingParty("https://x.example.org:8443/")).toEqual({ id: "x.example.org", origin: "https://x.example.org:8443" });
  });
  it("allows plain http on localhost only", () => {
    expect(relyingParty("http://localhost:8085")).toEqual({ id: "localhost", origin: "http://localhost:8085" });
    expect(relyingParty("http://example.onion")).toBeNull();
    expect(relyingParty("https://127.0.0.1")).toBeNull();
    expect(relyingParty("")).toBeNull();
    expect(relyingParty("not a url")).toBeNull();
  });
});

describe("ChallengeStore", () => {
  it("is single use", () => {
    const s = new ChallengeStore(1000);
    s.put("k", "c1", 0);
    expect(s.take("k", 10)).toBe("c1");
    expect(s.take("k", 20)).toBeNull();
  });
  it("expires", () => {
    const s = new ChallengeStore(1000);
    s.put("k", "c1", 0);
    expect(s.take("k", 1000)).toBeNull();
    expect(s.size).toBe(0);
  });
  it("replaces a key's challenge and sweeps expired ones", () => {
    const s = new ChallengeStore(1000);
    s.put("k", "old", 0);
    s.put("k", "new", 500);
    s.put("j", "x", 0);
    s.sweep(1200);
    expect(s.size).toBe(1);
    expect(s.take("k", 1200)).toBe("new");
  });
  it("stays bounded, dropping the oldest", () => {
    const s = new ChallengeStore(10_000, 3);
    for (const k of ["a", "b", "c", "d"]) s.put(k, k, 0);
    expect(s.size).toBe(3);
    expect(s.take("a", 1)).toBeNull();
    expect(s.take("d", 1)).toBe("d");
  });
});

describe("challengeOf", () => {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  it("reads the challenge from clientDataJSON", () => {
    expect(challengeOf({ response: { clientDataJSON: enc({ type: "webauthn.get", challenge: "abc" }) } })).toBe("abc");
  });
  it("is null on anything malformed", () => {
    expect(challengeOf(null)).toBeNull();
    expect(challengeOf({ response: { clientDataJSON: "%%%" } })).toBeNull();
    expect(challengeOf({ response: { clientDataJSON: enc({ challenge: 3 }) } })).toBeNull();
  });
});

describe("row mapping", () => {
  const row: CredentialRow = {
    id: "cred1",
    user_id: 1,
    public_key: Buffer.from([1, 2, 3]),
    counter: 4,
    transports: '["internal","hybrid","bogus"]',
    created_at: 10,
    last_used_at: null,
    label: "Mac · Safari",
  };
  it("gives the library a Uint8Array key and known transports", () => {
    const c = toCredential(row);
    expect(c.publicKey).toBeInstanceOf(Uint8Array);
    expect(Array.from(c.publicKey)).toEqual([1, 2, 3]);
    expect(c.transports).toEqual(["internal", "hybrid"]);
    expect(c.counter).toBe(4);
  });
  it("never lists the key", () => {
    expect(toView(row)).toEqual({ id: "cred1", label: "Mac · Safari", createdAt: 10, lastUsedAt: null });
  });
  it("tolerates bad transports", () => {
    expect(parseTransports("nope")).toEqual([]);
    expect(parseTransports(null)).toEqual([]);
  });
});

describe("deviceLabel", () => {
  it("names the device and browser", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows · Edge");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceLabel(undefined)).toBe("Passkey");
  });
});

describe("passkey store", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(ACCOUNT_SCHEMA);
    db.exec(PASSKEY_SCHEMA);
  });
  it("stores, touches, lists and deletes only one's own", () => {
    const a = upsertUser(db, "a@b.fr").id;
    const b = upsertUser(db, "c@d.fr").id;
    const key = new Uint8Array([9, 8, 7]);
    expect(insertCredential(db, { id: "k1", userId: a, publicKey: key, counter: 0, transports: ["internal"], label: "Mac" }, 100)).toBe(true);
    expect(insertCredential(db, { id: "k1", userId: b, publicKey: key, counter: 0, transports: [], label: "x" })).toBe(false);
    touchCredential(db, "k1", 5, 200);
    const row = credentialById(db, "k1")!;
    expect(row.counter).toBe(5);
    expect(Array.from(toCredential(row).publicKey)).toEqual([9, 8, 7]);
    expect(listPasskeys(db, a)).toEqual([{ id: "k1", label: "Mac", createdAt: 100, lastUsedAt: 200 }]);
    expect(deleteCredential(db, b, "k1")).toBe(false);
    expect(deleteCredential(db, a, "k1")).toBe(true);
  });
  it("go with the account", () => {
    const a = upsertUser(db, "a@b.fr").id;
    insertCredential(db, { id: "k1", userId: a, publicKey: new Uint8Array([1]), counter: 0, transports: [], label: "" });
    deleteUser(db, a);
    expect(credentialById(db, "k1")).toBeNull();
  });
});
