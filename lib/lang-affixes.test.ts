import { describe, expect, it } from "vitest";
import { AFFIXES, ROOTS, derive, meaning, nasalize } from "./lang-affixes";

const w = (root: string, affix: Parameters<typeof derive>[1]) => derive(root, affix).word;

describe("meN- nasal assimilation", () => {
  it("drops p, t, k, s after the nasal", () => {
    expect(w("pukul", "meN")).toBe("memukul");
    expect(w("tulis", "meN")).toBe("menulis");
    expect(w("kirim", "meN")).toBe("mengirim");
    expect(w("sapu", "meN")).toBe("menyapu");
    expect(derive("sapu", "meN").dropped).toBe("s");
  });
  it("keeps b, d, c, j, g, h and adds the matching nasal", () => {
    expect(w("baca", "meN")).toBe("membaca");
    expect(w("dengar", "meN")).toBe("mendengar");
    expect(w("cari", "meN")).toBe("mencari");
    expect(w("cium", "meN")).toBe("mencium");
    expect(w("jawab", "meN")).toBe("menjawab");
    expect(w("gambar", "meN")).toBe("menggambar");
    expect(w("hapus", "peN")).toBe("penghapus");
  });
  it("takes meng- before a vowel", () => {
    expect(w("ajar", "meN")).toBe("mengajar");
    expect(w("ambil", "meN")).toBe("mengambil");
    expect(w("ingat", "meN")).toBe("mengingat");
  });
  it("stays me- before l, m, n, r, w, y, ny", () => {
    expect(w("lihat", "meN")).toBe("melihat");
    expect(w("makan", "meN")).toBe("memakan");
    expect(w("nyanyi", "meN")).toBe("menyanyi");
    expect(w("rasa", "meN")).toBe("merasa");
  });
  it("menge- for monosyllabic roots", () => {
    expect(w("cat", "meN")).toBe("mengecat");
    expect(w("bom", "peN")).toBe("pengebom");
    expect(derive("cat", "meN").ruleId).toBe("monosyllabe");
  });
  it("keeps the consonant of a cluster", () => {
    expect(w("proses", "meN")).toBe("memproses");
    expect(w("kritik", "meN")).toBe("mengkritik");
    expect(w("traktir", "meN")).toBe("mentraktir");
    expect(w("syukur", "meN-i")).toBe("mensyukuri");
    expect(derive("proses", "meN").ruleId).toBe("groupe");
  });
  it("is not fooled by vowel sequences (main, cium are two syllables)", () => {
    expect(w("main", "meN-kan")).toBe("memainkan");
    expect(w("main", "peN")).toBe("pemain");
  });
});

describe("circumfixes and suffixes", () => {
  it("meN-…-kan and meN-…-i", () => {
    expect(w("dengar", "meN-kan")).toBe("mendengarkan");
    expect(w("kata", "meN-kan")).toBe("mengatakan");
    expect(w("bersih", "meN-kan")).toBe("membersihkan");
    expect(w("duduk", "meN-i")).toBe("menduduki");
    expect(w("suka", "meN-i")).toBe("menyukai");
    expect(w("temu", "meN-i")).toBe("menemui");
  });
  it("pe(N)-, pe(N)-…-an", () => {
    expect(w("tulis", "peN")).toBe("penulis");
    expect(w("beli", "peN")).toBe("pembeli");
    expect(w("lukis", "peN")).toBe("pelukis");
    expect(w("didik", "peN-an")).toBe("pendidikan");
    expect(w("bangun", "peN-an")).toBe("pembangunan");
    expect(w("latih", "peN-an")).toBe("pelatihan");
  });
  it("per-…-an, ke-…-an, -an, di-", () => {
    expect(w("jalan", "per-an")).toBe("perjalanan");
    expect(w("rumah", "per-an")).toBe("perumahan");
    expect(w("pustaka", "per-an")).toBe("perpustakaan");
    expect(w("sehat", "ke-an")).toBe("kesehatan");
    expect(w("makan", "an")).toBe("makanan");
    expect(w("tulis", "di")).toBe("ditulis");
  });
  it("ber- and ter- lose their r", () => {
    expect(w("jalan", "ber")).toBe("berjalan");
    expect(w("renang", "ber")).toBe("berenang");
    expect(w("kerja", "ber")).toBe("bekerja");
    expect(w("ternak", "ber")).toBe("beternak");
    expect(w("besar", "ter")).toBe("terbesar");
  });
});

describe("lexical exceptions", () => {
  it("are listed, not computed", () => {
    expect(w("ajar", "ber")).toBe("belajar");
    expect(w("kerja", "peN")).toBe("pekerja");
    expect(w("kerja", "peN-an")).toBe("pekerjaan");
    expect(w("punya", "meN-i")).toBe("mempunyai");
    expect(w("tahu", "meN-i")).toBe("mengetahui");
    expect(derive("punya", "meN-i").exception).toBeTruthy();
  });
});

describe("parts and data", () => {
  it("parts spell the word", () => {
    for (const r of ROOTS)
      for (const a of AFFIXES) {
        const d = derive(r.root, a.id);
        expect(d.parts.map((p) => p.text).join("")).toBe(d.word);
      }
  });
  it("every form a note lists is the one the rules build", () => {
    const listed: Record<string, string> = {
      "tulis|peN-an": "penulisan",
      "dengar|peN": "pendengar",
      "dingin|peN": "pendingin",
      "garis|peN": "penggaris",
      "potong|peN": "pemotong",
      "tutup|peN": "penutup",
      "telepon|meN": "menelepon",
      "tangis|meN": "menangis",
      "terima|meN": "menerima",
      "beri|meN-kan": "memberikan",
      "putus|meN-kan": "memutuskan",
      "lupa|meN-kan": "melupakan",
      "cinta|meN-i": "mencintai",
      "masuk|meN-i": "memasuki",
      "ikut|meN-i": "mengikuti",
      "ubah|per-an": "perubahan",
      "lapar|ke-an": "kelaparan",
      "tidur|ter": "tertidur",
    };
    for (const [k, v] of Object.entries(listed)) {
      const [root, affix] = k.split("|");
      expect(w(root, affix as Parameters<typeof derive>[1])).toBe(v);
    }
  });
  it("meaning comes from the notes only", () => {
    expect(meaning("tulis", "peN")).toBe("écrivain");
    expect(meaning("tulis", "ke-an")).toBeNull();
  });
  it("nasalize exposes the prefix and the remaining root", () => {
    expect(nasalize("tulis", "pe")).toMatchObject({ prefix: "pen", rest: "ulis", dropped: "t" });
  });
});
