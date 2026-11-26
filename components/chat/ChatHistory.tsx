"use client";

// « Mes questions »: every conversation, grouped by the note it was asked
// on (groupByNote), on its own screen. State stays in GardenChat.

import { groupByNote, type Conversation } from "@/lib/chat-history";
import { Ic } from "@/components/chat/chat-icons";
import { avColor, relTime, type Tr } from "@/components/chat/chat-helpers";

export function ChatHistory({
  tr,
  locale,
  chats,
  onBack,
  onSettings,
  onOpenNote,
  onResume,
  onDelete,
}: {
  tr: Tr;
  locale: string;
  chats: Conversation[];
  onBack: () => void;
  onSettings: () => void;
  /** Following a note's link: the chat closes first. */
  onOpenNote: () => void;
  onResume: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}) {
  const groups = groupByNote(chats);
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
        <button
          type="button"
          className="gc-ib"
          onClick={onSettings}
          aria-label={tr("chat.settings")}
          title={tr("chat.settings")}
        >
          {Ic.gear}
        </button>
      </div>
      <div className="gc-scroll">
        <h2 className="gc-big">{tr("chat.historyTitle")}</h2>
        {!groups.length && (
          <p className="gc-empty">{tr("chat.historyEmpty")}</p>
        )}
        {groups.map((g) => (
          <div className="gc-nb" key={g.note?.url ?? "all"}>
            <div className="gc-nb-hd">
              <span
                className="gc-av"
                style={{
                  background: g.note
                    ? avColor(g.note.discipline ?? g.note.title)
                    : "#3f6b4a",
                }}
              >
                {(g.note?.title ?? tr("chat.wholeGarden"))
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <span className="gc-nb-t">
                <b>{g.note?.title ?? tr("chat.wholeGarden")}</b>
                <span>
                  {g.note
                    ? (g.note.discipline ?? "")
                    : tr("chat.wholeGardenSub")}
                </span>
              </span>
              {g.note && (
                <a href={g.note.url} onClick={onOpenNote}>
                  {tr("chat.openNote")}
                </a>
              )}
            </div>
            {g.chats.map((c) => (
              <div className="gc-nb-q" key={c.id}>
                <button type="button" onClick={() => onResume(c)}>
                  {c.title}
                </button>
                <time>{relTime(c.updated, locale)}</time>
                <button
                  type="button"
                  className="gc-del"
                  aria-label={tr("chat.delete")}
                  onClick={() => onDelete(c)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
