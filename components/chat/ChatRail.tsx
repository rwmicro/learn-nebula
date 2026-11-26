"use client";

// The history column beside the conversation (from 640px, ☰): new
// conversation, a search, the conversations grouped by when (railGroups),
// the settings at the bottom. State stays in GardenChat; this only draws it.

import { railGroups } from "@/lib/chat-tools";
import type { Conversation } from "@/lib/chat-history";
import { Ic } from "@/components/chat/chat-icons";
import { avColor, type Tr } from "@/components/chat/chat-helpers";

export function ChatRail({
  tr,
  modKey,
  chats,
  query,
  currentId,
  pageUrl,
  onQuery,
  onNew,
  onResume,
  onDelete,
  onSettings,
}: {
  tr: Tr;
  modKey: string;
  /** Already filtered by the query (searchChats). */
  chats: Conversation[];
  query: string;
  currentId: string;
  pageUrl: string | null;
  onQuery: (q: string) => void;
  onNew: () => void;
  onResume: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
  onSettings: () => void;
}) {
  return (
    <aside className="gc-rail" aria-label={tr("chat.historyTitle")}>
      <button
        type="button"
        className="gc-rail-new"
        title={`${tr("chat.new")} (${modKey} ⇧ O)`}
        onClick={onNew}
      >
        {Ic.edit}
        <span>{tr("chat.new")}</span>
      </button>
      <label className="gc-rail-find">
        {Ic.search}
        <input
          type="search"
          value={query}
          placeholder={tr("chat.railFind")}
          aria-label={tr("chat.railFind")}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <div className="gc-rail-list">
        {railGroups(chats, pageUrl).map((g) => (
          <div key={g.key}>
            <div className="gc-rail-h">{tr(`chat.rail_${g.key}`)}</div>
            {g.chats.map((c) => (
              <div
                key={c.id}
                className={c.id === currentId ? "gc-rail-i on" : "gc-rail-i"}
              >
                <button
                  type="button"
                  onClick={() => onResume(c)}
                  title={c.title}
                >
                  <i
                    style={{
                      background: avColor(
                        c.note?.discipline ?? c.note?.title ?? "",
                      ),
                    }}
                  />
                  <span>{c.title}</span>
                </button>
                <button
                  type="button"
                  className="gc-rail-del"
                  aria-label={tr("chat.delete")}
                  title={tr("chat.delete")}
                  onClick={() => onDelete(c)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
        {!chats.length && (
          <p className="gc-rail-empty">
            {tr(query.trim() ? "chat.railNone" : "chat.historyEmpty")}
          </p>
        )}
      </div>
      <button type="button" className="gc-rail-set" onClick={onSettings}>
        {Ic.gear}
        <span>{tr("chat.settings")}</span>
      </button>
    </aside>
  );
}
