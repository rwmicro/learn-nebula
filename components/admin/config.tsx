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
import { SearchMissesCard, type MissesData } from "./SearchMissesCard";
import { FactsToCheckCard, type FactsReport } from "./FactsToCheckCard";
import { RebuildCard } from "./RebuildCard";
import { RagDebugCard } from "./RagDebugCard";
import { AccountsCard, ACCOUNTS_FLAGGED_ID, flaggedAccounts, type AccountsData } from "./AccountsCard";
import { UsageCard, nearCap, type UsageData } from "./UsageCard";
import { ActivityCard } from "./ActivityCard";
import { EventsCard } from "./EventsCard";
import { NotificationsCard } from "./NotificationsCard";
import { ReportsCard, REPORTS_ID, type ReportsData } from "./ReportsCard";
import { ClientErrorsCard, CLIENT_ERRORS_ID, type ClientErrorsData } from "./ClientErrorsCard";

export type TabId = "lecteurs" | "contenu" | "comptes" | "activite" | "site";

export interface AdminTab {
  /** Also the URL hash (#lecteurs). */
  id: TabId;
  label: string;
  /** Second key of the "g <key>" shortcut (AdminPanel). */
  key: string;
  /** Rendered in a two-column grid (admin-card--wide spans both); every
   *  card gets AdminCardProps. */
  cards: ComponentType<AdminCardProps>[];
}

export const ADMIN_TABS: AdminTab[] = [
  {
    id: "lecteurs",
    label: "Lecteurs",
    key: "l",
    cards: [PendingComments, PublishedComments, SearchMissesCard, QuestionsCard],
  },
  {
    id: "contenu",
    label: "Contenu",
    key: "c",
    cards: [ReportsCard, VaultHealthCard, PrereqSuggestionsCard, FactsToCheckCard],
  },
  {
    id: "comptes",
    label: "Comptes",
    key: "m",
    cards: [AccountsCard],
  },
  {
    id: "activite",
    label: "Activité",
    key: "a",
    cards: [ActivityCard, UsageCard],
  },
  {
    id: "site",
    label: "Site",
    key: "s",
    cards: [AssistantCard, VersionCard, RebuildCard, ClientErrorsCard, NotificationsCard, EventsCard, RagDebugCard],
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
    id: "search-misses",
    label: "recherches sans résultat",
    tab: "lecteurs",
    target: "admin-search-misses",
    useCount: ({ token, onUnauthorized }) =>
      useAdminResource<MissesData>(URLS.searchMisses, token, onUnauthorized).data?.total ?? null,
  },
  {
    id: "reports",
    label: "passages signalés par des lecteurs",
    tab: "contenu",
    target: REPORTS_ID,
    useCount: ({ token, onUnauthorized }) =>
      useAdminResource<ReportsData>(URLS.reports, token, onUnauthorized).data?.open.length ?? null,
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
    id: "facts",
    label: "faits à vérifier",
    tab: "contenu",
    target: "admin-facts",
    useCount: function useFactsCount({ token, onUnauthorized }) {
      const r = useAdminResource<FactsReport>(URLS.facts, token, onUnauthorized).data;
      return r?.source.found ? r.open : null;
    },
  },
  {
    id: "flagged-accounts",
    label: "comptes à vérifier (pièces)",
    tab: "comptes",
    target: ACCOUNTS_FLAGGED_ID,
    useCount: ({ token, onUnauthorized }) => {
      const d = useAdminResource<AccountsData>(URLS.accounts, token, onUnauthorized).data;
      return d ? flaggedAccounts(d).length : null;
    },
  },
  {
    id: "usage",
    label: "plafonds de l'assistant bientôt atteints",
    tab: "activite",
    target: "admin-usage",
    useCount: ({ token, onUnauthorized }) => {
      const d = useAdminResource<UsageData>(URLS.usage, token, onUnauthorized).data;
      return d ? [d.ask, d.translate].filter(nearCap).length : null;
    },
  },
  {
    id: "client-errors",
    label: "erreurs chez les lecteurs",
    tab: "site",
    target: CLIENT_ERRORS_ID,
    useCount: ({ token, onUnauthorized }) =>
      useAdminResource<ClientErrorsData>(URLS.clientErrors, token, onUnauthorized).data?.total ?? null,
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
