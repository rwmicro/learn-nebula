"use client";

import { useEffect, useState } from "react";
import { HoldButton } from "@/components/ui/HoldButton";
import { Avatar } from "@/components/account/Avatar";
import type { Look } from "@/lib/avatar";
import type { Tr } from "@/components/account/shared";
import { IconTrash } from "@/components/account/icons";
import { renderBold } from "@/components/account/LoginPhone";

/**
 * Deleting the account, as a bottom sheet over the "Compte" screen: what is
 * lost (the coins in bold), what stays in this browser, and a red button
 * that acts only once held down until it is full (components/ui/HoldButton).
 * Escape or a tap on the scrim closes it.
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
  const [busy, setBusy] = useState(false);

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
      <div className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="ap-del-title">
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
        <div className="ap-sheet-actions">
          <HoldButton
            className="ap-btn ap-btn--danger"
            disabled={busy}
            hint={tr("hold.hint")}
            tooShort={tr("hold.tooShort")}
            onConfirm={() => {
              setBusy(true);
              void onDelete().finally(() => setBusy(false));
            }}
          >
            {tr("account.deleteNow")}
          </HoldButton>
          <button type="button" className="ap-btn ap-btn--ghost" onClick={onClose}>
            {tr("account.cancel")}
          </button>
        </div>
      </div>
    </>
  );
}
