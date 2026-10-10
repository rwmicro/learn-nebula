#!/usr/bin/env python3
"""Refreshes lib/data/lichess-openings.json: how often each opening the vault
shows is played on Lichess, and how it scores, by rating band.

Source: the Lichess open database (https://database.lichess.org/, CC0), one
monthly dump of rated standard games, read as a stream: only the first
--games games are decompressed, nothing is stored. The Lichess opening
explorer API would answer this directly but now requires an account token,
and a committed snapshot keeps the build offline and reproducible.

Which positions: every prefix (up to 12 plies) of the `moves:` of a
```widget:echiquier or ```widget:ouverture block that starts from the initial
position, found by scanning the vault (--vault, default content/posts).

Run by hand, about once a year:
    pip install chess zstandard
    python3 scripts/update-lichess.py --month 2026-09 --games 1000000
"""
import argparse, io, json, os, re, sys, urllib.request
import chess
import zstandard

START = chess.STARTING_FEN.split(" ")[0]
BANDS = [(0, 1400, "<1400"), (1400, 1800, "1400-1800"), (1800, 2200, "1800-2200"), (2200, 9999, "2200+")]
MAX_PLIES = 12

def vault_lines(vault):
    """UCI move lists from widget blocks that start at the initial position."""
    out = []
    for root, _, files in os.walk(vault):
        for f in files:
            if not f.endswith(".md"):
                continue
            text = open(os.path.join(root, f), encoding="utf-8").read()
            for block in re.findall(r"```widget:(?:echiquier|ouverture)\n(.*?)```", text, re.S):
                fen = re.search(r"^fen:\s*(\S+)", block, re.M)
                if fen and fen.group(1) != START:
                    continue
                m = re.search(r"^(?:moves|coups):\s*(.+)$", block, re.M)
                if m:
                    out.append(m.group(1).split())
    return out

def to_san(uci_moves):
    """(san, uci) of the legal leading moves, at most MAX_PLIES."""
    b = chess.Board()
    san, uci = [], []
    for u in uci_moves[:MAX_PLIES]:
        mv = chess.Move.from_uci(u)
        if mv not in b.legal_moves:
            break
        san.append(b.san(mv))
        uci.append(u)
        b.push(mv)
    return san, uci

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True)
    ap.add_argument("--games", type=int, default=1_000_000)
    ap.add_argument("--vault", default="content/posts")
    ap.add_argument("--out", default="lib/data/lichess-openings.json")
    a = ap.parse_args()

    # Games are matched on SAN (what the PGN dump contains); the output is keyed
    # by the UCI moves the vault's blocks are written in.
    wanted = {}
    for line in vault_lines(a.vault):
        san, uci = to_san(line)
        for k in range(0, len(san) + 1):
            wanted[" ".join(san[:k])] = " ".join(uci[:k])
    print(f"{len(wanted)} positions to count", file=sys.stderr)

    stats = {k: {"bands": {b[2]: [0, 0, 0] for b in BANDS}, "next": {}} for k in wanted}
    url = f"https://database.lichess.org/standard/lichess_db_standard_rated_{a.month}.pgn.zst"
    resp = urllib.request.urlopen(url)
    reader = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(resp), encoding="utf-8", errors="replace")

    games = 0
    head = {}
    for line in reader:
        if line.startswith("["):
            m = re.match(r'\[(\w+) "(.*)"\]', line)
            if m:
                head[m.group(1)] = m.group(2)
            continue
        if not line.strip() or line.startswith("[") or "Result" not in head:
            continue
        # Movetext line: drop comments, move numbers and the result.
        text = re.sub(r"\{[^}]*\}", " ", line)
        toks = [t for t in text.split() if not re.match(r"^\d+\.+$", t) and t not in ("1-0", "0-1", "1/2-1/2", "*")]
        toks = [re.sub(r"[?!]+$", "", t) for t in toks[: MAX_PLIES + 1]]
        res = {"1-0": 0, "1/2-1/2": 1, "0-1": 2}.get(head.get("Result"))
        try:
            avg = (int(head.get("WhiteElo", 0)) + int(head.get("BlackElo", 0))) / 2
        except ValueError:
            avg = 0
        band = next((b[2] for b in BANDS if b[0] <= avg < b[1]), None)
        if res is not None and band and head.get("Variant", "Standard") == "Standard":
            for k in range(0, min(len(toks), MAX_PLIES) + 1):
                key = " ".join(toks[:k])
                s = stats.get(key)
                if s is None:
                    if k > 0:
                        break
                    continue
                s["bands"][band][res] += 1
                if k < len(toks):
                    s["next"][toks[k]] = s["next"].get(toks[k], 0) + 1
        games += 1
        head = {}
        if games % 100_000 == 0:
            print(f"{games} games", file=sys.stderr)
        if games >= a.games:
            break

    out = {
        "source": f"Lichess open database (CC0), parties classées standard de {a.month}, {games} premières parties du fichier",
        "month": a.month,
        "games": games,
        "bands": [b[2] for b in BANDS],
        "positions": {},
    }
    for key, s in stats.items():
        total = sum(sum(v) for v in s["bands"].values())
        if not total:
            continue
        nxt = sorted(s["next"].items(), key=lambda kv: -kv[1])[:6]
        out["positions"][wanted[key]] = {"san": key, "bands": s["bands"], "next": nxt}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"wrote {a.out}: {len(out['positions'])} positions from {games} games", file=sys.stderr)

if __name__ == "__main__":
    main()
