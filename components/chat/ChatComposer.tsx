"use client";

// Where the reader writes: the three modes (answer, socratic, « Avec mes
// mots »), the « + » menu that attaches the section on screen, the page's
// selection or another note, and the composer itself (pinned passage,
// textarea, dictation, send / stop). State and actions stay in GardenChat.

import type { RefObject } from "react";
import type { ChatMode } from "@/lib/chat-history";
import { Ic } from "@/components/chat/chat-icons";
import type { NoteRef, Tr } from "@/components/chat/chat-helpers";

const MODES = [
  ["answer", "chat.modeAnswer"],
  ["socratic", "chat.modeSocratic"],
  ["own", "chat.modeOwn"],
] as const;

export function ModeTabs({
  tr,
  mode,
  busy,
  ownAvailable,
  onMode,
}: {
  tr: Tr;
  mode: ChatMode;
  busy: boolean;
  /** « Avec mes mots » needs a passage to explain. */
  ownAvailable: boolean;
  onMode: (m: ChatMode) => void;
}) {
  return (
    <div className="gc-modes" role="tablist" aria-label={tr("chat.modesAria")}>
      {MODES.map(([m, k]) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          className={mode === m ? "on" : ""}
          disabled={busy || (m === "own" && !ownAvailable)}
          onClick={() => onMode(m)}
        >
          {tr(k)}
        </button>
      ))}
    </div>
  );
}

export function AttachButton({
  tr,
  open,
  onToggle,
}: {
  tr: Tr;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={open ? "gc-plus gc-menu-btn on" : "gc-plus gc-menu-btn"}
      aria-label={tr("chat.attach")}
      title={tr("chat.attach")}
      aria-expanded={open}
      // Keep the page's selection: no focus change on press.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
    >
      {Ic.plus}
    </button>
  );
}

export function AttachMenu({
  tr,
  picking,
  query,
  notes,
  found,
  onPage,
  selection,
  onQuery,
  onAttachNote,
  onAttachSection,
  onAttachSelection,
  onPickNote,
}: {
  tr: Tr;
  /** Showing the note search rather than the three choices. */
  picking: boolean;
  query: string;
  /** All notes (null while the index loads). */
  notes: NoteRef[] | null;
  /** Those that match the query. */
  found: NoteRef[];
  /** On a note page: « la section à l'écran » is offered. */
  onPage: boolean;
  /** The page's last selection, "" when none. */
  selection: string;
  onQuery: (q: string) => void;
  onAttachNote: (n: NoteRef) => void;
  onAttachSection: () => void;
  onAttachSelection: () => void;
  onPickNote: () => void;
}) {
  return (
    <div className="gc-menu gc-attach" role="menu">
      {picking ? (
        <>
          <input
            className="gc-menu-find"
            autoFocus
            value={query}
            placeholder={tr("chat.attachFind")}
            aria-label={tr("chat.attachFind")}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && found[0]) {
                e.preventDefault();
                onAttachNote(found[0]);
              }
            }}
          />
          <div className="gc-menu-list">
            {notes === null ? (
              <p className="gc-menu-empty">…</p>
            ) : found.length ? (
              found.map((n) => (
                <button
                  key={n.href}
                  type="button"
                  role="menuitem"
                  onClick={() => onAttachNote(n)}
                >
                  {Ic.doc}
                  <span>
                    {n.title}
                    {n.folder && <small>{n.folder}</small>}
                  </span>
                </button>
              ))
            ) : (
              <p className="gc-menu-empty">{tr("chat.attachNone")}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p>{tr("chat.attach")}</p>
          {onPage && (
            <button
              type="button"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onAttachSection}
            >
              {Ic.sec}
              <span>{tr("chat.attachSection")}</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={!selection}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onAttachSelection}
          >
            {Ic.sel}
            <span>
              {tr("chat.attachSelection")}
              {selection && (
                <small>
                  «{" "}
                  {selection.length > 50
                    ? `${selection.slice(0, 50)}…`
                    : selection}{" "}
                  »
                </small>
              )}
            </span>
          </button>
          <button type="button" role="menuitem" onClick={onPickNote}>
            {Ic.doc}
            <span>{tr("chat.attachNote")}</span>
            <kbd>@</kbd>
          </button>
        </>
      )}
    </div>
  );
}

export function Composer({
  tr,
  inputRef,
  started,
  busy,
  canSend,
  mode,
  input,
  passage,
  passageFrom,
  noteTitle,
  canDictate,
  listening,
  attachButton,
  attachMenu,
  onInput,
  onSubmit,
  onAt,
  onEditLast,
  onClearPassage,
  onRemoveNote,
  onDictate,
}: {
  tr: Tr;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** The conversation has messages: the composer is a pill under them. */
  started: boolean;
  busy: boolean;
  canSend: boolean;
  mode: ChatMode;
  input: string;
  passage: string;
  passageFrom: string;
  /** The note asked about, shown as a chip before the first question; "" for none. */
  noteTitle: string;
  canDictate: boolean;
  listening: boolean;
  attachButton: React.ReactNode;
  attachMenu: React.ReactNode;
  onInput: (v: string) => void;
  /** Send, or stop while an answer is being written. */
  onSubmit: () => void;
  /** « @ » typed alone: pick a note. */
  onAt: () => void;
  /** ↑ in an empty composer: edit the last question. Returns whether it did. */
  onEditLast: () => boolean;
  onClearPassage: () => void;
  onRemoveNote: () => void;
  onDictate: () => void;
}) {
  return (
    <form
      className={started ? "gc-comp gc-comp-pill" : "gc-comp"}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {attachMenu}
      {passage && (
        <div className="gc-pin">
          <span>
            {passageFrom && <b className="gc-pin-from">{passageFrom}</b>}
            {passage.length > 140 ? `${passage.slice(0, 140)}…` : passage}
          </span>
          <button
            type="button"
            onClick={onClearPassage}
            aria-label={tr("chat.removePassage")}
          >
            ×
          </button>
        </div>
      )}
      {started && attachButton}
      <textarea
        ref={inputRef}
        rows={1}
        value={input}
        maxLength={1000}
        onChange={(e) => {
          if (e.target.value === "@" && !input) {
            onAt();
            return;
          }
          onInput(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && !input && started && !busy) {
            if (onEditLast()) e.preventDefault();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={tr(
          mode === "own"
            ? "chat.placeholderOwn"
            : started
              ? "chat.placeholderShort"
              : "chat.placeholder",
        )}
        aria-label={tr("chat.placeholderShort")}
      />
      <div className="gc-comp-row">
        {!started && attachButton}
        {!started && noteTitle && (
          <span className="gc-ctx">
            {Ic.doc}
            <span>{noteTitle}</span>
            <button
              type="button"
              aria-label={tr("chat.removeNote")}
              onClick={onRemoveNote}
            >
              ×
            </button>
          </span>
        )}
        <span className="gc-sp" />
        {canDictate && (
          <button
            type="button"
            className={listening ? "gc-mic on" : "gc-mic"}
            onClick={onDictate}
            aria-label={tr("chat.dictate")}
          >
            {Ic.mic}
          </button>
        )}
        <button
          type="submit"
          className={busy ? "gc-stop" : canSend ? "gc-send" : "gc-send off"}
          aria-label={tr(busy ? "chat.stop" : "chat.send")}
        >
          {busy ? <i /> : Ic.up}
        </button>
      </div>
    </form>
  );
}
