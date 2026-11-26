// The site's own browser events: how the vanilla note scripts (public/js),
// the React islands and lib/client talk to each other without importing
// each other. Every `gk:*`, `theme:change` and `i18n:change` the code
// dispatches or listens to is listed here, with who sends it and its
// `detail`. lib/events.test.ts fails on a name used in the code but missing
// here (or listed here but used nowhere).
//
// Types: `GkEventDetail` is merged into WindowEventMap / DocumentEventMap
// (types/gk-events.d.ts), so `addEventListener("gk:chat-ask", e => …)` gets a
// typed `e.detail` in TS and in public/js (checkJs).

/** Name → what it means, who sends it, who listens. */
export const SITE_EVENTS = {
  // --- the assistant (components/chat/GardenChat.tsx listens) -------------
  "gk:chat-ask": "Open the chat, optionally with a question. Home field, home desk, palette.",
  "gk:pin-chat": "Open the chat on its home. Home page.",
  "gk:explain": "Explain the selected passage. Selection menu (public/js/selection-menu.js).",
  "gk:explain-own": "« Avec mes mots » on the selected passage. Selection menu.",
  "gk:ai-setup": "Open only the model download / not-available sheet. translate-device.js.",
  "gk:chat-focus": "The page in the « côte à côte » frame asks the chat above to take focus.",
  // --- reading, study and progress ----------------------------------------
  "gk:activity": "Something counted toward the day's streak (lib/personal.ts recordActivity, cards, highlights, bookmarks).",
  "gk:note-read": "The open note just counted as read. public/js/reading-state.js.",
  "gk:reading-change": "Reading progress changed (lib/reading-progress.ts CHANGE_EVENT).",
  "gk:study-change": "A parcours step's study state changed (lib/client/path-study.ts STUDY_EVENT).",
  "gk:quiz-change": "A quiz answer was stored (quiz.js, lesson.js, note-end.js, study-tools.js).",
  "gk:exercise": "An exercise card was answered. public/js/exercises.js.",
  "gk:widget-goal": "A widget's goal was reached (dispatched on document). widgets.js, widget-kit.js.",
  "gk:highlight": "The reader highlighted a passage. Selection menu.",
  "gk:cloze": "Make a cloze card from a highlight; study-tools.js answers through `done`. highlights.js.",
  "gk:progress-imported": "A progress file was imported (lib/progress-transfer.ts PROGRESS_IMPORTED_EVENT).",
  // --- account (lib/client/account-client.ts sends) -----------------------
  "gk:account": "The signed-in hint changed.",
  "gk:progress-synced": "Progress was merged with the server.",
  "gk:coins": "The server granted coins on the last sync.",
  "gk:passkeys": "A passkey was created. lib/client/passkey-client.ts.",
  // --- site-wide ----------------------------------------------------------
  "theme:change": "Light / dark / paper changed. public/js/theme.js.",
  "i18n:change": "The interface language changed. public/js/i18n.js.",
} as const;

export type SiteEventName = keyof typeof SITE_EVENTS;

/** The `detail` of each event (undefined: a plain Event, no detail). */
export interface GkEventDetail {
  "gk:chat-ask": { question?: string; scope?: string };
  "gk:pin-chat": undefined;
  "gk:explain": { text: string };
  "gk:explain-own": { text: string };
  "gk:ai-setup": { for?: "translate" | string; after?: () => void } | undefined;
  "gk:chat-focus": undefined;
  "gk:activity": { kind: string };
  "gk:note-read": undefined;
  "gk:reading-change": unknown;
  "gk:study-change": unknown;
  "gk:quiz-change": undefined;
  "gk:exercise": { type?: string; ok: boolean };
  "gk:widget-goal": { first: boolean };
  "gk:highlight": { range: Range; text: string };
  "gk:cloze": { quote: string; mark: Element; done: (i18nKey: string) => void };
  "gk:progress-imported": unknown;
  "gk:account": { in: boolean } & Record<string, unknown>;
  "gk:progress-synced": undefined;
  "gk:coins": { earned: number; coins: number };
  "gk:passkeys": undefined;
  "theme:change": unknown;
  "i18n:change": unknown;
}
