"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { Look } from "@/lib/avatar";
import type { Tr } from "@/components/account/shared";
import { IconCheck, IconTrash } from "@/components/account/icons";
import { renderBold } from "@/components/account/LoginPhone";

/**
 * Deleting the account, as a bottom sheet over the "Compte" screen: what is
 * lost (the coins in bold), what stays in this browser, and the word to type
 * before the red button arms (the e-mail shown is masked, so it cannot be the
 * thing to retype). Escape or a tap on the scrim closes it.
 */
export function DeleteSheet({
  coins,
  look,
  tr,
  onClose,
  onDelete,
}: {
  coins: number;
  look: Look;
  tr: Tr;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const word = tr("account.deleteWord");
  const ok = typed.trim().toLocaleLowerCase() === word.toLocaleLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("ap-locked");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("ap-locked");
    };
  }, [onClose]);

  return (
    <>
      <div className="ap-scrim" onClick={onClose} aria-hidden="true" />
      <form
        className="ap-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ap-del-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok || busy) return;
          setBusy(true);
          void onDelete().finally(() => setBusy(false));
        }}
      >
        <span className="ap-grab" aria-hidden="true" />
        <span className="ap-sheet-ico" aria-hidden="true">
          <IconTrash />
        </span>
        <h3 id="ap-del-title">{tr("compte.deleteTitle")}</h3>
        <p className="ap-sheet-text">
          {renderBold(tr("compte.deleteText", { coins: "\u0000" }), tr("compte.deleteCoins", { n: coins }))}
        </p>
        <div className="ap-keep">
          <Avatar look={look} size={40} still />
          <span>{tr("compte.deleteKeep")}</span>
        </div>
        <label className="ap-field ap-field--danger">
          <span>{tr("account.deleteType", { word }).replace(/\s*:\s*$/, "")}</span>
          <span className={`ap-input${ok ? " is-ok" : ""}`}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {ok && (
              <span className="ap-ok" aria-hidden="true">
                <IconCheck />
              </span>
            )}
          </span>
        </label>
        <div className="ap-sheet-actions">
          <button type="submit" className="ap-btn ap-btn--danger" disabled={!ok || busy}>
            {tr("account.deleteNow")}
          </button>
          <button type="button" className="ap-btn ap-btn--ghost" onClick={onClose}>
            {tr("account.cancel")}
          </button>
        </div>
      </form>
    </>
  );
}
