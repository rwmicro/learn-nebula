/**
 * Browser glue for /duel/ (components/play/Duel.tsx): joins a room over the
 * /api/room/<code> WebSocket (server/routes/room.ts), then sets up one
 * RTCPeerConnection with the other browser — a data channel, plus the
 * microphone for a tandem. Once the channel is open the socket is closed:
 * everything else goes browser to browser.
 *
 * Both sides announce `hello` only after their reader agreed to connect (the
 * IP notice), and the host makes the offer once both have. The pure message
 * checks are in lib/duel.ts.
 */
import { parseDuo, type DuoMsg } from "./duel";

export type DuoKind = "duel" | "tandem";
export type DuoRole = "host" | "guest";
export type DuoError = "gone" | "full" | "rate" | "expired" | "network" | "failed";

export interface DuoRoom {
  kind: DuoKind;
  ref: string | null;
  role: DuoRole;
}

export interface DuoEvents {
  room(r: DuoRoom, peerHere: boolean): void;
  peer(on: boolean): void;
  linking(): void;
  open(): void;
  closed(): void;
  error(e: DuoError): void;
  message(m: DuoMsg): void;
  track?(s: MediaStream): void;
}

export interface IceInfo {
  iceServers: RTCIceServer[];
  relay: boolean;
  /** The room server answered at all (false: a static copy of the site). */
  ok: boolean;
}

export const duoSupported = () =>
  typeof window !== "undefined" && typeof RTCPeerConnection === "function" && typeof WebSocket === "function";

export const micSupported = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";

/** STUN only when the server can't be asked (or has no TURN key). */
export async function fetchIce(): Promise<IceInfo> {
  try {
    const r = await fetch("/api/room/ice", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as IceInfo;
      if (Array.isArray(j.iceServers)) return { iceServers: j.iceServers, relay: !!j.relay, ok: true };
    }
  } catch {
    /* fall through */
  }
  return { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], relay: false, ok: false };
}

/** POST /api/room → the creator's link "/duel/#<code>~<key>", or null. */
export async function createRoom(kind: DuoKind, ref: string | null): Promise<string | null> {
  try {
    const r = await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ref }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { code?: string; key?: string };
    return j.code && j.key ? `/duel/#${j.code}~${j.key}` : null;
  } catch {
    return null;
  }
}

const CLOSE: Record<number, DuoError> = { 4003: "full", 4004: "gone", 4008: "rate", 4009: "expired" };
/** Both said hello but no channel after this long: blocked network. */
const LINK_TIMEOUT_MS = 25_000;

export class DuoLink {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private role: DuoRole | null = null;
  private localReady = false;
  private remoteReady = false;
  private live = false;
  private done = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private ice: IceInfo | null = null;
  private relay = false;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly code: string,
    private readonly key: string | null,
    private readonly ev: DuoEvents,
  ) {}

  join(): void {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${location.host}/api/room/${this.code}`);
    } catch {
      this.ev.error("network");
      return;
    }
    this.ws = ws;
    let joined = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: "join", ...(this.key ? { k: this.key } : {}) }));
    ws.onmessage = (e) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === "room") {
        joined = true;
        this.role = m.role === "host" ? "host" : "guest";
        this.ev.room(
          { kind: m.kind === "tandem" ? "tandem" : "duel", ref: typeof m.ref === "string" ? m.ref : null, role: this.role },
          !!m.peer,
        );
      } else if (m.t === "peer") {
        if (m.on) {
          if (this.localReady) this.signal({ t: "hello" });
        } else if (!this.live) {
          this.remoteReady = false;
          this.resetPc();
        }
        this.ev.peer(!!m.on);
      } else if (m.t === "hello") {
        const first = !this.remoteReady;
        this.remoteReady = true;
        if (first && this.localReady) this.signal({ t: "hello" });
        this.maybeOffer();
      } else if (m.t === "offer") void this.onOffer(m.sdp as RTCSessionDescriptionInit);
      else if (m.t === "answer") void this.onAnswer(m.sdp as RTCSessionDescriptionInit);
      else if (m.t === "ice") void this.onIce(m.c as RTCIceCandidateInit);
      else if (m.t === "bye" && !this.live) this.ev.peer(false);
    };
    ws.onclose = (e) => {
      this.ws = null;
      if (this.live || this.done) return;
      this.ev.error(CLOSE[e.code] ?? (joined ? "network" : e.code === 1006 ? "gone" : "network"));
    };
  }

  /** The reader agreed: announce ourselves (and connect when both have). */
  start(ice: IceInfo, relay: boolean, stream: MediaStream | null = null): void {
    this.ice = ice;
    this.relay = relay && ice.relay;
    this.stream = stream;
    this.localReady = true;
    this.signal({ t: "hello" });
    this.maybeOffer();
  }

  send(m: DuoMsg): void {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(m));
  }

  close(): void {
    this.done = true;
    this.send({ t: "bye" });
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close(1000);
    this.ws = null;
    this.resetPc();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  private signal(o: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }

  private resetPc(): void {
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.pendingIce = [];
  }

  private newPc(): RTCPeerConnection {
    this.resetPc();
    const pc = new RTCPeerConnection({
      iceServers: this.ice?.iceServers ?? [],
      iceTransportPolicy: this.relay ? "relay" : "all",
    });
    this.pc = pc;
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream as MediaStream));
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ t: "ice", c: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => this.ev.track?.(e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "failed") {
        if (this.live) this.ended();
        else this.fail();
      } else if (s === "closed" && this.live) this.ended();
    };
    pc.ondatachannel = (e) => this.wire(e.channel);
    this.ev.linking();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.live) this.fail();
    }, LINK_TIMEOUT_MS);
    return pc;
  }

  private wire(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => {
      this.live = true;
      if (this.timer) clearTimeout(this.timer);
      // The rest is browser to browser: the server forgets us.
      this.ws?.close(1000);
      this.ws = null;
      this.ev.open();
    };
    dc.onmessage = (e) => {
      const m = parseDuo(e.data);
      if (!m) return;
      if (m.t === "bye") this.ended();
      else this.ev.message(m);
    };
    dc.onclose = () => {
      if (this.live) this.ended();
    };
  }

  private ended(): void {
    if (this.done) return;
    this.done = true;
    this.resetPc();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ev.closed();
  }

  private fail(): void {
    if (this.done) return;
    this.resetPc();
    this.ev.error("failed");
  }

  private async maybeOffer(): Promise<void> {
    if (this.role !== "host" || !this.localReady || !this.remoteReady || this.pc) return;
    const pc = this.newPc();
    this.wire(pc.createDataChannel("duo", { ordered: true }));
    try {
      await pc.setLocalDescription(await pc.createOffer());
      this.signal({ t: "offer", sdp: pc.localDescription?.toJSON() });
    } catch {
      this.fail();
    }
  }

  private async onOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (this.role !== "guest" || !this.localReady || !sdp) return;
    const pc = this.newPc();
    try {
      await pc.setRemoteDescription(sdp);
      await this.flushIce();
      await pc.setLocalDescription(await pc.createAnswer());
      this.signal({ t: "answer", sdp: pc.localDescription?.toJSON() });
    } catch {
      this.fail();
    }
  }

  private async onAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.pc;
    if (this.role !== "host" || !pc || !sdp || pc.signalingState !== "have-local-offer") return;
    try {
      await pc.setRemoteDescription(sdp);
      await this.flushIce();
    } catch {
      this.fail();
    }
  }

  private async onIce(c: RTCIceCandidateInit): Promise<void> {
    if (!c) return;
    if (!this.pc?.remoteDescription) {
      if (this.pendingIce.length < 64) this.pendingIce.push(c);
      return;
    }
    try {
      await this.pc.addIceCandidate(c);
    } catch {
      /* a stale candidate */
    }
  }

  private async flushIce(): Promise<void> {
    const q = this.pendingIce;
    this.pendingIce = [];
    for (const c of q) await this.onIce(c);
  }
}
