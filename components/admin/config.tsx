"use client";

// What the /admin page shows, in one place: the tabs (each an ordered list of
// card components) and the dashboard tiles above them (one per actionable
// count, each pointing at the card that resolves it). To add a card, append
// its component to a tab's `cards`; to add a tile, append to DASHBOARD_TILES
// with a `useCount` hook (read the card's endpoint through useAdminResource so
// the tile and the card share one request). A tab gets its attention dot from
// its tiles: any tile of that tab with a count above zero.

import type { ComponentType } from "react";
import type { AdminCardProps } from "./shared";
import { URLS, useAdminResource, useIgnoredPrereqs } from "./store";
import { PendingComments, type PendingData } from "./PendingComments";
import { PublishedComments } from "./PublishedComments";
import { QuestionsCard, QUESTIONS_WEAK_ID, type QuestionsData } from "./QuestionsCard";
import { VaultHealthCard, HEALTH_SECTION_IDS, type VaultReport } from "./VaultHealthCard";
import { PrereqSuggestionsCard, livePrereqCount, type PrereqReport } from "./PrereqSuggestionsCard";
import { AssistantCard } from "./AssistantCard";
import { VersionCard, type VersionStatus } from "./VersionCard";

export type TabId = "lecteurs" | "contenu" | "site";

export interface AdminTab {
  /** Also the URL hash (#lecteurs). */
  id: TabId;
  label: string;
  /** Rendered top to bottom; every card gets AdminCardProps. */
  cards: ComponentType<AdminCardProps>[];
}

export const ADMIN_TABS: AdminTab[] = [
  {
    id: "lecteurs",
    label: "Lecteurs",
    cards: [PendingComments, PublishedComments, QuestionsCard],
  },
  {
    id: "contenu",
    label: "Contenu",
    cards: [VaultHealthCard, PrereqSuggestionsCard],
  },
  {
    id: "site",
    label: "Site",
    cards: [AssistantCard, VersionCard],
  },
];

/** Context handed to every tile's useCount hook. */
export interface TileContext {
  token: string;
  onUnauthorized: () => void;
}

export interface DashboardTile {
  id: string;
  /** Short label under the number ("commentaires en attente"). */
  label: string;
  tab: TabId;
  /** Element id to jump to inside the tab: a card's <section id>, a
   *  <details> (opened on arrival) or a <button> (clicked on arrival). */
  target: string;
  /** null = not known (loading, unavailable). A React hook: called once per
   *  render of its tile, unconditionally. */
  useCount: (ctx: TileContext) => number | null;
}

export const DASHBOARD_TILES: DashboardTile[] = [
  {
    id: "pending",
    label: "commentaires en attente",
    tab: "lecteurs",
    target: "admin-pending",
    useCount: ({ token, onUnauthorized }) =>
      useAdminResource<PendingData>(URLS.pending, token, onUnauthorized).data?.comments.length ?? null,
  },
  {
    id: "weak-questions",
    label: "questions mal couvertes",
    tab: "lecteurs",
    target: QUESTIONS_WEAK_ID,
    useCount: ({ token, onUnauthorized }) =>
      useAdminResource<QuestionsData>(URLS.questions, token, onUnauthorized).data?.weak.length ?? null,
  },
  {
    id: "broken-links",
    label: "notes aux liens cassés",
    tab: "contenu",
    target: HEALTH_SECTION_IDS.brokenLinks,
    useCount: ({ token, onUnauthorized }) =>
      useAdminResource<VaultReport>(URLS.vaultHealth, token, onUnauthorized).data?.brokenLinks.length ?? null,
  },
  {
    id: "audio",
    label: "notes à l'audio manquant ou vide",
    tab: "contenu",
    target: HEALTH_SECTION_IDS.audio,
    useCount: ({ token, onUnauthorized }) =>
      useAdminResource<VaultReport>(URLS.vaultHealth, token, onUnauthorized).data?.audio.length ?? null,
  },
  {
    id: "prereqs",
    label: "prérequis suggérés",
    tab: "contenu",
    target: "admin-prereqs",
    useCount: function usePrereqCount({ token, onUnauthorized }) {
      const report = useAdminResource<PrereqReport>(URLS.prereqs, token, onUnauthorized).data;
      const ignored = useIgnoredPrereqs();
      return report ? livePrereqCount(report, ignored) : null;
    },
  },
  {
    id: "behind",
    label: "commits de retard sur pensine",
    tab: "site",
    target: "admin-version",
    useCount: function useBehindCount({ token, onUnauthorized }) {
      const v = useAdminResource<VersionStatus>(URLS.version, token, onUnauthorized).data;
      if (!v || v.status === "unknown") return null;
      return v.status === "behind" ? Math.max(1, v.behind ?? 1) : 0;
    },
  },
];
