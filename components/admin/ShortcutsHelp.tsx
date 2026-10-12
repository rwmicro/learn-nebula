"use client";

// The "?" sheet: every keyboard shortcut of the console in one list. A native
// <dialog> (showModal), so Escape, the focus trap and the backdrop come free.

import { useEffect, useRef } from "react";
import { BUTTON_CLASS } from "./shared";
import { ADMIN_TABS } from "./config";

const GENERAL: [string, string][] = [
  ["/", "filtrer dans la section"],
  ["r", "tout relire"],
  ["?", "cette aide"],
];

const PENDING: [string, string][] = [
  ["j / k", "commentaire suivant / précédent"],
  ["a", "approuver"],
  ["d", "supprimer (annulable)"],
  ["x", "sélectionner"],
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="admin-help-title"
      className="admin-help"
    >
      <h2 id="admin-help-title" className="admin-eyebrow m-0 mb-3">
        raccourcis clavier
      </h2>
      <div className="admin-help-cols">
        <Group
          title="Sections"
          rows={ADMIN_TABS.map((t, i) => [`g ${t.key}  ·  ${i + 1}`, t.label] as [string, string])}
        />
        <Group title="Partout" rows={GENERAL} />
        <Group title="Commentaire en attente sélectionné" rows={PENDING} />
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className={BUTTON_CLASS} onClick={onClose} autoFocus>
          Fermer
        </button>
      </div>
    </dialog>
  );
}

function Group({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section>
      <h3 className="m-0 mb-1 text-small font-semibold text-ink">{title}</h3>
      <dl className="admin-help-list">
        {rows.map(([k, label]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
