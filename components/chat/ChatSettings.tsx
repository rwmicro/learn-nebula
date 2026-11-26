"use client";

// The chat's settings screen: Gemini Nano's state (and « Réessayer » when
// Chrome set it aside), the downloaded model (switch, space, hold to delete),
// what happens when nothing can answer. State and actions stay in GardenChat.

import { nanoSetAsideReason } from "@/lib/client/browser-ai";
import { CORRECTOR, type LocalModel } from "@/lib/client/local-llm";
import type { AiRoute } from "@/lib/client/garden-ai";
import { HoldButton } from "@/components/ui/HoldButton";
import { Ic } from "@/components/chat/chat-icons";
import { fmtDay, type Tr } from "@/components/chat/chat-helpers";

export function ChatSettings({
  tr,
  locale,
  route,
  nano,
  nanoWhy,
  phone,
  model,
  onDisk,
  downloadedOn,
  onBack,
  onRetryNano,
  onToggleLocal,
  onDelete,
}: {
  tr: Tr;
  locale: string;
  route: AiRoute | null;
  /** Gemini Nano's availability, as GardenChat keeps it. */
  nano: string | null;
  nanoWhy: (why: string) => string;
  /** Say « téléphone » rather than « appareil ». */
  phone: boolean;
  model: LocalModel;
  onDisk: { main: boolean; corrector: boolean };
  downloadedOn: string | null;
  onBack: () => void;
  onRetryNano: () => void;
  /** The model switch: off when on, the consent sheet when off. */
  onToggleLocal: () => void;
  onDelete: () => void;
}) {
  const gb = model.gb.toLocaleString(locale);
  return (
    <>
      <div className="gc-top">
        <button
          type="button"
          className="gc-ib"
          onClick={onBack}
          aria-label={tr("chat.back")}
        >
          {Ic.back}
        </button>
        <div className="gc-ttl" />
        <span className="gc-ib" />
      </div>
      <div className="gc-scroll gc-set">
        <h2 className="gc-big">{tr("chat.setTitle")}</h2>
        {route === "nano" && (
          <p className="gc-fine gc-fine-left">{tr("chat.setNano")}</p>
        )}
        {nano && (
          <>
            <div className="gc-grp">Gemini Nano (Chrome)</div>
            <div className="gc-box">
              <div className="gc-li">
                <span className="gc-li-tx">
                  {tr(`chat.nanoState.${nano}`)}
                  {nano === "aside" && (
                    <span>{nanoWhy(nanoSetAsideReason())}</span>
                  )}
                </span>
                {nano === "aside" && (
                  <button
                    type="button"
                    className="gc-btn sec"
                    onClick={onRetryNano}
                  >
                    {tr("chat.nanoRetry")}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        <div className="gc-grp">{tr("chat.setModel")}</div>
        <div className="gc-box">
          <div className="gc-li">
            <span className="gc-li-tx">
              {tr(phone ? "chat.setUsePhone" : "chat.setUseDevice")}
              <span>
                {!onDisk.main
                  ? tr("chat.setNotDownloaded", { name: model.name })
                  : downloadedOn
                    ? tr("chat.setDownloaded", {
                        date: fmtDay(downloadedOn, locale),
                        name: model.name,
                      })
                    : tr("chat.setOnDisk", { name: model.name })}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={route === "local"}
              className={route === "local" ? "gc-tg on" : "gc-tg"}
              onClick={onToggleLocal}
            />
          </div>
          <div className="gc-li">
            <span className="gc-li-tx">
              {tr("chat.setSpace")}
              {onDisk.corrector && (
                <span>
                  {tr("chat.setSpaceCorrector", {
                    n: CORRECTOR.gb.toLocaleString(locale),
                  })}
                </span>
              )}
            </span>
            <em>
              {tr("chat.setGb", {
                n: (
                  (onDisk.main ? model.gb : 0) +
                  (onDisk.corrector ? CORRECTOR.gb : 0)
                ).toLocaleString(locale),
              })}
            </em>
          </div>
          {onDisk.main && (
            <HoldButton
              className="gc-li gc-red"
              hint={tr("hold.hint")}
              tooShort={tr("hold.tooShort")}
              onConfirm={onDelete}
            >
              {tr("chat.setDelete", { n: gb })}
            </HoldButton>
          )}
        </div>
        <div className="gc-grp">{tr("chat.setFail")}</div>
        <div className="gc-box">
          <div className="gc-li">
            <span className="gc-li-tx">
              {tr("chat.setFailA")}
              <span>{tr("chat.setFailB")}</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
