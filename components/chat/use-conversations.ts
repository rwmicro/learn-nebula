"use client";

// The chat's conversations: the one on screen and the ones kept in this
// browser (lib/chat-history.ts, localStorage). `convRef` always holds the
// latest conversation, for the streaming code that outlives a render.

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteChat, saveChat, type Conversation } from "@/lib/chat-history";
import { emptyConv } from "@/components/chat/chat-helpers";

const store = () => (typeof localStorage === "undefined" ? null : localStorage);

export function useConversations() {
  const [conv, setConv] = useState<Conversation>(() =>
    emptyConv(null, "", "answer"),
  );
  const [chats, setChats] = useState<Conversation[]>([]);
  const convRef = useRef(conv);
  useEffect(() => {
    convRef.current = conv;
  }, [conv]);

  /** Keep a conversation that has messages. */
  const persist = useCallback((c: Conversation) => {
    const s = store();
    if (!s || !c.messages.length) return;
    try {
      setChats(saveChat(s, c));
    } catch {
      /* storage blocked */
    }
  }, []);

  /** Change the conversation on screen (and keep it when `save`). */
  const updateConv = useCallback(
    (fn: (c: Conversation) => Conversation, save = false) => {
      const next = fn(convRef.current);
      convRef.current = next;
      setConv(next);
      if (save) persist(next);
    },
    [persist],
  );

  /** Forget a kept conversation. */
  const removeChat = useCallback((id: string) => {
    const s = store();
    if (s) setChats(deleteChat(s, id));
  }, []);

  return {
    conv,
    setConv,
    convRef,
    chats,
    setChats,
    store,
    persist,
    updateConv,
    removeChat,
  };
}
