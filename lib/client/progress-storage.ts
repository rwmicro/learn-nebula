// The browser side of lib/progress-transfer.ts (shared by /progression/,
// the command palette and the account sync): this browser's storage and the
// export download. Kept apart so the server can import the format and merge
// rules without the DOM.

import {
  buildExport,
  collectProgress,
  exportFilename,
  type ReadStore,
} from "../progress-transfer";

/** localStorage, or null when it's blocked (private mode, disabled storage). */
export function progressStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    localStorage.setItem("srs:probe", "1");
    localStorage.removeItem("srs:probe");
    return localStorage;
  } catch {
    return null;
  }
}

/** The export file's text for what this browser holds. */
export function exportText(store: ReadStore, now = new Date()): string {
  return JSON.stringify(buildExport(collectProgress(store), now), null, 1);
}

/** Download this browser's progress as a dated JSON file; returns its name,
 *  or null when storage is blocked. */
export function downloadExport(now = new Date()): string | null {
  const store = progressStorage();
  if (!store) return null;
  const name = exportFilename(now);
  const url = URL.createObjectURL(
    new Blob([exportText(store, now)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
