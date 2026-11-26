"use client";

// The on-device model's download, in the chat: the offer (size, Wi-Fi, kept
// on the device) and, once started, the ring of 60 dots with what has
// arrived and the time left. State and the download itself stay in
// GardenChat (lib/client/local-llm.ts does the work).

import type { LoadProgress } from "@/lib/client/local-llm";
import { Ic } from "@/components/chat/chat-icons";
import { fmtMb, type Tr } from "@/components/chat/chat-helpers";

export function DownloadOffer({
  tr,
  phone,
  gb,
  onGo,
  onLater,
}: {
  tr: Tr;
  phone: boolean;
  /** The model's size, already formatted for the locale. */
  gb: string;
  onGo: () => void;
  onLater: () => void;
}) {
  return (
    <div className="gc-dl">
      <div className="gc-dl-hd">
        <span className="gc-dl-ic">{Ic.chip}</span>
        <div>
          <b>{tr(phone ? "chat.dlTitlePhone" : "chat.dlTitleDevice")}</b>
          <p>{tr("chat.dlText")}</p>
        </div>
      </div>
      <div className="gc-facts">
        <div>
          {Ic.dl}
          <span>
            <strong>{gb} Go</strong> {tr("chat.dlOnce")}
          </span>
        </div>
        <div>
          {Ic.wifi}
          <span>{tr("chat.dlWifi")}</span>
        </div>
        <div>
          {Ic.disk}
          <span>{tr("chat.dlKeep")}</span>
        </div>
      </div>
      <div className="gc-btns">
        <button type="button" className="gc-btn pri" onClick={onGo}>
          {tr("chat.dlGo", { n: gb })}
        </button>
        <button type="button" className="gc-btn lnk" onClick={onLater}>
          {tr("chat.dlLater")}
        </button>
      </div>
    </div>
  );
}

// The download as a ring of 60 dots (chat.css .gc-ring), one lit for each
// sixtieth that has arrived, every fifth a little larger, like a dial.
const RING_DOTS = 60;

export function DownloadProgress({
  tr,
  locale,
  progress,
  pct,
  loadingOnly,
  secsLeft,
  onCancel,
}: {
  tr: Tr;
  locale: string;
  progress: LoadProgress | null;
  pct: number;
  /** Only loading from the browser's cache, nothing to download. */
  loadingOnly: boolean;
  secsLeft: number | null;
  onCancel: () => void;
}) {
  const lit = Math.round((pct / 100) * RING_DOTS);
  return (
    <div className="gc-prog">
      <div
        className="gc-ring"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={tr(loadingOnly ? "chat.dlLoading" : "chat.dlProgress")}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {Array.from({ length: RING_DOTS }, (_, i) => {
            const a = -Math.PI / 2 + (i / RING_DOTS) * Math.PI * 2;
            return (
              <circle
                key={i}
                className={i < lit ? "is-on" : undefined}
                cx={(50 + 42 * Math.cos(a)).toFixed(2)}
                cy={(50 + 42 * Math.sin(a)).toFixed(2)}
                r={i % 5 === 0 ? 2.6 : 1.9}
              />
            );
          })}
        </svg>
        <span className="gc-ring-pct">{pct} %</span>
      </div>
      <div className="gc-prog-tx">
        <b>{tr(loadingOnly ? "chat.dlLoading" : "chat.dlProgress")}</b>
        <dl className="gc-prog-st">
          <div>
            <dt>{tr("chat.dlGot")}</dt>
            <dd>
              {progress
                ? tr("chat.dlBytes", {
                    a: fmtMb(progress.loaded, locale),
                    b: fmtMb(progress.total, locale),
                  })
                : "…"}
            </dd>
          </div>
          {!loadingOnly && (
            <div>
              <dt>{tr("chat.dlLeft")}</dt>
              <dd>
                {secsLeft === null
                  ? "…"
                  : secsLeft >= 60
                    ? tr("chat.dlLeftMin", { n: Math.ceil(secsLeft / 60) })
                    : tr("chat.dlLeftSec", { n: Math.max(1, secsLeft) })}
              </dd>
            </div>
          )}
        </dl>
        <button type="button" onClick={onCancel}>
          {tr("chat.dlCancel")}
        </button>
      </div>
    </div>
  );
}
